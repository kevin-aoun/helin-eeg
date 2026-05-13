"""Offline EEG motor-imagery prediction from XDF recordings.

This module contains the reusable prediction pipeline used by the Next.js API.
It intentionally reads recorded XDF files, not live LSL streams. The XDF files
carry LSL timestamps and streams recorded by LabRecorder.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import warnings
from collections import Counter
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

import joblib
import numpy as np
import pyxdf
from mne.decoding import CSP
from scipy.signal import butter, filtfilt
from sklearn.exceptions import InconsistentVersionWarning


LABEL_TO_INT = {
    "left": 0,
    "l": 0,
    "right": 1,
    "r": 1,
    "rest": 2,
    "stop": 2,
    "nomi": 2,
    "no_mi": 2,
    "no-mi": 2,
    "cue_onset_nomi": 2,
}
INT_TO_LABEL = {-1: "UNKNOWN", 0: "LEFT", 1: "RIGHT", 2: "REST"}
PROB_KEYS = ("left", "right", "rest")


@dataclass
class SegmentPrediction:
    segment_number: int
    start_time: float
    end_time: float
    expected: int = -1
    expected_name: str = "unknown"
    predicted: int = -1
    predicted_name: str = "UNKNOWN"
    confidence: float = 0.0
    probabilities: Dict[str, float] = field(default_factory=dict)
    graph_time: List[float] = field(default_factory=list)
    graph_channels: List[List[float]] = field(default_factory=list)
    is_valid: bool = True


@dataclass
class WindowPrediction:
    window_number: int
    start_time: float
    end_time: float
    expected: int
    expected_name: str
    predicted: int
    predicted_name: str
    confidence: float
    probabilities: Dict[str, float]
    command: str
    command_duration_sec: float
    segments: List[SegmentPrediction] = field(default_factory=list)

    @property
    def duration_seconds(self) -> float:
        return self.end_time - self.start_time

    @property
    def is_correct(self) -> bool:
        return self.expected >= 0 and self.predicted == self.expected


def bandpass_array(data: np.ndarray, low: float, high: float, fs: float, order: int = 4) -> np.ndarray:
    nyquist = fs / 2
    b, a = butter(order, [low / nyquist, high / nyquist], btype="band")
    return filtfilt(b, a, data, axis=-1)


class FBCSPFeatures:
    """Filter Bank CSP feature extractor used by older saved model pickles."""

    def __init__(self, filter_banks=None, n_components: int = 8, fs: float = 250):
        self.filter_banks = filter_banks
        self.n_components = n_components
        self.fs = fs
        self.csps_ = []

    def _band_data(self, data: np.ndarray, low: float, high: float) -> np.ndarray:
        return bandpass_array(data, low, high, self.fs)

    def fit(self, data: np.ndarray, y: np.ndarray) -> "FBCSPFeatures":
        self.csps_ = []
        for low, high in self.filter_banks:
            filtered = self._band_data(data, low, high)
            csp = CSP(
                n_components=self.n_components,
                reg="ledoit_wolf",
                log=True,
                norm_trace=False,
            )
            csp.fit(filtered, y)
            self.csps_.append(csp)
        return self

    def transform(self, data: np.ndarray) -> np.ndarray:
        features = []
        for (low, high), csp in zip(self.filter_banks, self.csps_):
            filtered = self._band_data(data, low, high)
            features.append(csp.transform(filtered))
        return np.concatenate(features, axis=1)

    def fit_transform(self, data: np.ndarray, y: np.ndarray) -> np.ndarray:
        return self.fit(data, y).transform(data)


def normalize_label(value: Any) -> str:
    if value is None:
        return "unknown"
    if isinstance(value, (int, np.integer)):
        return INT_TO_LABEL.get(int(value), "UNKNOWN").lower()
    text = str(value).strip().lower().replace(" ", "_")
    if text in {"cue_onset_left", "mi_left", "left"}:
        return "left"
    if text in {"cue_onset_right", "mi_right", "right"}:
        return "right"
    if text in {"cue_onset_nomi", "cue_onset_no_mi", "nomi", "no_mi", "no-mi", "rest", "stop"}:
        return "rest"
    return text if text in PROB_KEYS else "unknown"


def label_to_int(value: Any) -> int:
    if isinstance(value, (int, np.integer)):
        return int(value) if int(value) in (-1, 0, 1, 2) else -1
    return LABEL_TO_INT.get(normalize_label(value), -1)


def int_to_label(value: int) -> str:
    return INT_TO_LABEL.get(int(value), "UNKNOWN")


def zero_probabilities() -> Dict[str, float]:
    return {"left": 0.0, "right": 0.0, "rest": 0.0}


def probabilities_from_vector(proba: Sequence[float]) -> Dict[str, float]:
    values = list(proba) if proba is not None else []
    while len(values) < 3:
        values.append(0.0)
    return {"left": float(values[0]), "right": float(values[1]), "rest": float(values[2])}


def command_from_label(label: str) -> str:
    normalized = normalize_label(label)
    if normalized == "left":
        return "L"
    if normalized == "right":
        return "R"
    return "S"


def notch(data: np.ndarray, freq: float, fs: float, order: int = 2) -> Optional[np.ndarray]:
    nyquist = fs / 2
    bandwidth = freq / 35.0
    low, high = (freq - bandwidth) / nyquist, (freq + bandwidth) / nyquist
    low, high = max(low, 1e-4), min(high, 0.9999)
    b, a = butter(order, [low, high], btype="bandstop")
    min_len = 3 * (2 * order + 1)
    if data.shape[-1] <= min_len:
        return None
    return filtfilt(b, a, data, axis=-1)


def bandpass(data: np.ndarray, low: float, high: float, fs: float, order: int = 4) -> Optional[np.ndarray]:
    nyquist = fs / 2
    b, a = butter(order, [low / nyquist, high / nyquist], btype="band")
    min_len = 3 * (2 * order + 1)
    if data.shape[-1] <= min_len:
        return None
    return filtfilt(b, a, data, axis=-1)


def is_bad_epoch_amp(epoch: Optional[np.ndarray], threshold_uv: float = 150.0) -> bool:
    if epoch is None:
        return True
    return bool(np.any(np.ptp(epoch, axis=1) > threshold_uv))


def get_eeg_stream(streams: Sequence[dict]) -> Optional[dict]:
    for stream in streams:
        info = stream.get("info", {})
        stream_type = info.get("type", [""])[0]
        srate = float(info.get("nominal_srate", [0])[0] or 0)
        if stream_type == "EEG" or srate > 0:
            return stream
    return None


def get_marker_stream(streams: Sequence[dict], name: str) -> Optional[dict]:
    for stream in streams:
        info = stream.get("info", {})
        stream_type = info.get("type", [""])[0]
        stream_name = info.get("name", [""])[0]
        if stream_type.lower() in {"marker", "markers"} and stream_name == name:
            return stream
    return None


def build_expected_sequence(marker_stream: Optional[dict]) -> List[Tuple[float, str]]:
    if marker_stream is None:
        return []

    expected = []
    for timestamp, sample in zip(marker_stream["time_stamps"], marker_stream["time_series"]):
        if len(sample) == 0:
            continue
        label = normalize_label(sample[0])
        if label in PROB_KEYS:
            expected.append((float(timestamp), label))
    return expected


def cut_epoch(eeg_data: np.ndarray, eeg_ts: np.ndarray, start_abs: float, duration_sec: float) -> Optional[np.ndarray]:
    end_abs = start_abs + duration_sec
    indices = np.where((eeg_ts >= start_abs) & (eeg_ts < end_abs))[0]
    if len(indices) < 2:
        return None
    return eeg_data[:, indices]


def trim_to_length(epoch: Optional[np.ndarray], trained_epoch_len: int) -> Optional[np.ndarray]:
    if epoch is None:
        return None
    if trained_epoch_len <= 0:
        return epoch
    if epoch.shape[-1] < trained_epoch_len:
        return None
    return epoch[:, :trained_epoch_len]


def graph_payload(epoch: Optional[np.ndarray], duration_sec: float, channel_limit: int, point_limit: int) -> Tuple[List[float], List[List[float]]]:
    if epoch is None or epoch.size == 0 or epoch.shape[1] <= 1:
        return [], []
    step = max(1, int(np.ceil(epoch.shape[1] / point_limit)))
    sampled = epoch[: min(channel_limit, epoch.shape[0]), ::step]
    times = np.linspace(0.0, duration_sec, sampled.shape[1]).astype(float).tolist()
    return times, sampled.astype(float).tolist()


def is_contaminated(start_abs: float, end_abs: float, artifact_times: Sequence[float], margin: float = 0.1) -> bool:
    return any(start_abs - margin <= artifact_time <= end_abs + margin for artifact_time in artifact_times)


def majority_vote(labels: Sequence[str], probability_scores: Optional[Dict[str, float]] = None) -> str:
    cleaned = [normalize_label(label) for label in labels]
    cleaned = [label for label in cleaned if label in PROB_KEYS]
    if not cleaned:
        return "unknown"

    counts = Counter(cleaned)
    best_count = max(counts.values())
    tied = [label for label, count in counts.items() if count == best_count]
    if len(tied) == 1:
        return tied[0]
    if probability_scores:
        return max(tied, key=lambda label: probability_scores.get(label, 0.0))
    return "unknown"


def summed_probabilities(segments: Sequence[SegmentPrediction]) -> Dict[str, float]:
    return {
        key: float(sum(segment.probabilities.get(key, 0.0) for segment in segments))
        for key in PROB_KEYS
    }


def averaged_probabilities(segments: Sequence[SegmentPrediction]) -> Dict[str, float]:
    if not segments:
        return zero_probabilities()
    return {
        key: float(sum(segment.probabilities.get(key, 0.0) for segment in segments) / len(segments))
        for key in PROB_KEYS
    }


def predict_epoch(epoch: np.ndarray, fb: Any, scaler: Any, model: Any, confidence_threshold: float) -> Tuple[Optional[int], Optional[Sequence[float]]]:
    features = fb.transform(np.expand_dims(epoch, axis=0))
    features = scaler.transform(features)
    proba = model.predict_proba(features)[0]
    pred = int(np.argmax(proba))
    if pred in {0, 1} and float(proba[pred]) < confidence_threshold:
        pred = 2
    return pred, proba


def fallback_segment(
    segment_number: int,
    start_time: float,
    end_time: float,
    graph_epoch: Optional[np.ndarray],
    is_valid: bool,
    expected_name: str,
    channel_limit: int,
    point_limit: int,
) -> SegmentPrediction:
    times, channels = graph_payload(graph_epoch, end_time - start_time, channel_limit, point_limit)
    return SegmentPrediction(
        segment_number=segment_number,
        start_time=float(start_time),
        end_time=float(end_time),
        expected=label_to_int(expected_name),
        expected_name=expected_name,
        predicted=-1,
        predicted_name="UNKNOWN",
        confidence=0.0,
        probabilities=zero_probabilities(),
        graph_time=times,
        graph_channels=channels,
        is_valid=is_valid,
    )


def predict_segment(
    *,
    eeg_data: np.ndarray,
    eeg_ts: np.ndarray,
    segment_number: int,
    segment_start_abs: float,
    segment_duration_sec: float,
    expected_name: str,
    artifact_times: Sequence[float],
    fb: Any,
    scaler: Any,
    model: Any,
    trained_epoch_len: int,
    amp_ptp_uv: float,
    confidence_threshold: float,
    channel_limit: int,
    point_limit: int,
) -> SegmentPrediction:
    segment_end_abs = segment_start_abs + segment_duration_sec
    graph_epoch = cut_epoch(eeg_data, eeg_ts, segment_start_abs, segment_duration_sec)

    if is_contaminated(segment_start_abs, segment_end_abs, artifact_times):
        return fallback_segment(
            segment_number,
            segment_start_abs,
            segment_end_abs,
            graph_epoch,
            False,
            expected_name,
            channel_limit,
            point_limit,
        )

    epoch = trim_to_length(graph_epoch, trained_epoch_len)
    if epoch is None or is_bad_epoch_amp(epoch, amp_ptp_uv):
        return fallback_segment(
            segment_number,
            segment_start_abs,
            segment_end_abs,
            graph_epoch,
            False,
            expected_name,
            channel_limit,
            point_limit,
        )

    pred, proba = predict_epoch(epoch, fb, scaler, model, confidence_threshold)
    if pred is None or proba is None:
        return fallback_segment(
            segment_number,
            segment_start_abs,
            segment_end_abs,
            graph_epoch,
            False,
            expected_name,
            channel_limit,
            point_limit,
        )

    probabilities = probabilities_from_vector(proba)
    times, channels = graph_payload(graph_epoch, segment_duration_sec, channel_limit, point_limit)
    return SegmentPrediction(
        segment_number=segment_number,
        start_time=float(segment_start_abs),
        end_time=float(segment_end_abs),
        expected=label_to_int(expected_name),
        expected_name=expected_name,
        predicted=int(pred),
        predicted_name=int_to_label(int(pred)),
        confidence=float(max(probabilities.values())),
        probabilities=probabilities,
        graph_time=times,
        graph_channels=channels,
        is_valid=True,
    )


def load_model_bundle(model_path: str) -> Dict[str, Any]:
    warnings.filterwarnings("ignore", category=InconsistentVersionWarning)

    import __main__

    __main__.FBCSPFeatures = FBCSPFeatures
    saved = joblib.load(model_path)
    for key in ("fb", "scaler", "model", "config"):
        if key not in saved:
            raise KeyError(f"Missing '{key}' in model bundle: {model_path}")
    return saved


def predict_windows_from_xdf(
    *,
    xdf_path: str,
    model_path: str,
    start_time_sec: Optional[float] = None,
    end_time_sec: Optional[float] = None,
    times_are_relative: bool = False,
    window_size_sec: float = 6.0,
    base_segment_sec: float = 2.0,
    command_duration_sec: float = 2.0,
    channel_limit: int = 3,
    point_limit: int = 260,
) -> List[WindowPrediction]:
    if window_size_sec <= 0 or base_segment_sec <= 0:
        raise ValueError("window_size_sec and base_segment_sec must be positive.")
    if abs((window_size_sec / base_segment_sec) - round(window_size_sec / base_segment_sec)) > 1e-6:
        raise ValueError("window_size_sec must be a multiple of base_segment_sec.")

    saved = load_model_bundle(model_path)
    config = saved["config"]
    sfreq = float(config.get("sfreq", 250))
    filt_low = float(config.get("filter_low", 8.0))
    filt_high = float(config.get("filter_high", 30.0))
    notch_freq = float(config.get("notch_freq", 50.0))
    confidence_threshold = float(config.get("confidence_threshold", 0.0))
    amp_ptp_uv = float(config.get("amp_ptp_uv", 150.0))
    trained_epoch_len = int(config.get("trained_epoch_len", round(base_segment_sec * sfreq)))

    streams, _ = pyxdf.load_xdf(xdf_path)
    eeg_stream = get_eeg_stream(streams)
    if eeg_stream is None:
        raise RuntimeError("No EEG stream found in XDF file.")

    mi_stream = get_marker_stream(streams, "MI_Markers")
    artifact_stream = get_marker_stream(streams, "artifacts")
    expected_sequence = build_expected_sequence(mi_stream)
    if not expected_sequence:
        raise RuntimeError("No MI markers found in XDF file.")

    eeg_data = np.array(eeg_stream["time_series"], dtype=float).T
    eeg_ts = np.array(eeg_stream["time_stamps"], dtype=float)
    if eeg_ts.size == 0:
        raise RuntimeError("EEG stream is empty.")

    fs_actual = float(eeg_stream["info"].get("nominal_srate", [sfreq])[0] or sfreq)
    fs = fs_actual if fs_actual > 0 else sfreq
    filtered = notch(eeg_data, notch_freq, fs)
    if filtered is None:
        raise RuntimeError("EEG too short for notch filtering.")
    filtered = bandpass(filtered, filt_low, filt_high, fs)
    if filtered is None:
        raise RuntimeError("EEG too short for bandpass filtering.")

    recording_start_abs = float(eeg_ts[0])
    if start_time_sec is None:
        start_abs = expected_sequence[0][0]
    else:
        start_abs = recording_start_abs + start_time_sec if times_are_relative else start_time_sec

    if end_time_sec is None:
        end_abs = expected_sequence[-1][0] + window_size_sec
    else:
        end_abs = recording_start_abs + end_time_sec if times_are_relative else end_time_sec

    if end_abs <= start_abs:
        raise ValueError("End time must be greater than start time.")

    artifact_times = list(artifact_stream["time_stamps"]) if artifact_stream is not None else []
    selected_markers = [
        (marker_time, label)
        for marker_time, label in expected_sequence
        if start_abs <= marker_time < end_abs and normalize_label(label) in PROB_KEYS
    ]
    if not selected_markers:
        raise RuntimeError("No prediction windows were created. Check the time range and markers.")

    segments_per_window = int(round(window_size_sec / base_segment_sec))
    windows: List[WindowPrediction] = []

    for window_index, (marker_time, expected_label) in enumerate(selected_markers, start=1):
        expected_name = normalize_label(expected_label)
        segments = []
        for segment_offset in range(segments_per_window):
            segment_start_abs = marker_time + segment_offset * base_segment_sec
            segments.append(
                predict_segment(
                    eeg_data=filtered,
                    eeg_ts=eeg_ts,
                    segment_number=segment_offset + 1,
                    segment_start_abs=segment_start_abs,
                    segment_duration_sec=base_segment_sec,
                    expected_name=expected_name,
                    artifact_times=artifact_times,
                    fb=saved["fb"],
                    scaler=saved["scaler"],
                    model=saved["model"],
                    trained_epoch_len=trained_epoch_len,
                    amp_ptp_uv=amp_ptp_uv,
                    confidence_threshold=confidence_threshold,
                    channel_limit=channel_limit,
                    point_limit=point_limit,
                )
            )

        valid_segments = [
            segment for segment in segments
            if segment.is_valid and normalize_label(segment.predicted_name) in PROB_KEYS
        ]
        if valid_segments:
            probability_sums = summed_probabilities(valid_segments)
            predicted_name = majority_vote(
                [segment.predicted_name for segment in valid_segments],
                probability_sums,
            )
            predicted = label_to_int(predicted_name)
            probabilities = averaged_probabilities(valid_segments)
        else:
            predicted_name = "unknown"
            predicted = -1
            probabilities = zero_probabilities()

        windows.append(
            WindowPrediction(
                window_number=window_index,
                start_time=float(marker_time),
                end_time=float(marker_time + window_size_sec),
                expected=label_to_int(expected_name),
                expected_name=expected_name,
                predicted=predicted,
                predicted_name=int_to_label(predicted),
                confidence=float(max(probabilities.values())) if probabilities else 0.0,
                probabilities=probabilities,
                command=command_from_label(predicted_name),
                command_duration_sec=command_duration_sec,
                segments=segments,
            )
        )

    return windows


def summarize(windows: Sequence[WindowPrediction]) -> Dict[str, Any]:
    scored = [window for window in windows if window.expected >= 0 and window.predicted >= 0]
    correct = sum(1 for window in scored if window.is_correct)
    return {
        "windows": len(windows),
        "scored_windows": len(scored),
        "correct": correct,
        "accuracy": (correct / len(scored) * 100.0) if scored else 0.0,
        "window_size_sec": windows[0].duration_seconds if windows else 0.0,
        "command_duration_sec": windows[0].command_duration_sec if windows else 0.0,
    }


def windows_to_json(windows: Sequence[WindowPrediction]) -> Dict[str, Any]:
    return {
        "summary": summarize(windows),
        "windows": [
            {
                **asdict(window),
                "duration": window.duration_seconds,
                "correct": window.is_correct,
            }
            for window in windows
        ],
    }


def default_model_path() -> str:
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "complete_model.pkl")


def main() -> int:
    parser = argparse.ArgumentParser(description="Predict motor-imagery windows from an XDF recording.")
    parser.add_argument("xdf_path")
    parser.add_argument("--model", default=default_model_path())
    parser.add_argument("--start", type=float, default=None)
    parser.add_argument("--end", type=float, default=None)
    parser.add_argument("--relative", action="store_true", help="Treat --start/--end as seconds from EEG stream start.")
    parser.add_argument("--window", type=float, default=6.0)
    parser.add_argument("--segment", type=float, default=2.0)
    parser.add_argument("--command-duration", type=float, default=2.0)
    try:
        args = parser.parse_args()
        windows = predict_windows_from_xdf(
            xdf_path=args.xdf_path,
            model_path=args.model,
            start_time_sec=args.start,
            end_time_sec=args.end,
            times_are_relative=args.relative,
            window_size_sec=args.window,
            base_segment_sec=args.segment,
            command_duration_sec=args.command_duration,
        )
        print(json.dumps(windows_to_json(windows)))
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
