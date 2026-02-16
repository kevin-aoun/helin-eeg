"""
Real-time EEG feedback processor.

Reads EEG via LSL, computes mu/beta band power at C3/C4,
writes feedback.json for dashboard and PsychoPy consumption.

Usage:
    python feedback.py --config path/to/config.json
"""

import argparse
import json
import os
import signal
import sys
import time
from collections import deque

import numpy as np
from pylsl import resolve_bypred, StreamInlet, proc_clocksync
from scipy.signal import welch

CHANNEL_MAPS = {
    8: {"C3": 1, "C4": 3},
    14: {"C3": 3, "C4": 5},
    32: {"C3": 7, "C4": 11},
}

MU_BAND = (8, 13)
BETA_BAND = (13, 30)

WINDOW_SEC = 1.0
UPDATE_INTERVAL = 0.25
BASELINE_DURATION = 5.0
STREAM_TIMEOUT = 3.0
RETRY_INTERVAL = 2.0


class FeedbackWriter:
    def __init__(self, filepath):
        self._filepath = filepath

    def write(self, data):
        tmp_path = self._filepath + f".{os.getpid()}.tmp"
        try:
            with open(tmp_path, "w") as f:
                json.dump(data, f)
            os.replace(tmp_path, self._filepath)
        except OSError:
            try:
                os.remove(tmp_path)
            except OSError:
                pass


class FeedbackProcessor:
    def __init__(self, config_path):
        with open(config_path) as f:
            config = json.load(f)

        self.srate = config["device_frequency"]
        self.window_samples = int(self.srate * WINDOW_SEC)

        project_root = os.path.dirname(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        )
        tmp_dir = os.path.join(project_root, "tmp")
        os.makedirs(tmp_dir, exist_ok=True)

        self.writer = FeedbackWriter(os.path.join(tmp_dir, "feedback.json"))
        self._running = True

        self.buffer_c3 = deque(maxlen=self.window_samples)
        self.buffer_c4 = deque(maxlen=self.window_samples)

        self.baseline_mu_values = []
        self.baseline_mu_mean = None

        self.inlet = None
        self.stream_name = None
        self.c3_idx = None
        self.c4_idx = None

        signal.signal(signal.SIGTERM, self._handle_signal)
        signal.signal(signal.SIGINT, self._handle_signal)

    def _handle_signal(self, signum, frame):
        self._running = False

    def _resolve_stream(self):
        try:
            streams = resolve_bypred(
                "type != 'Markers' and nominal_srate > 0",
                timeout=STREAM_TIMEOUT,
            )
        except Exception:
            return False

        if not streams:
            return False

        info = streams[0]
        self.stream_name = info.name()
        n_channels = info.channel_count()

        self.c3_idx = None
        self.c4_idx = None

        ch_xml = info.desc().child("channels")
        if not ch_xml.empty():
            labels = []
            ch = ch_xml.child("channel")
            while not ch.empty():
                labels.append(ch.child_value("label"))
                ch = ch.next_sibling()
            if "C3" in labels and "C4" in labels:
                self.c3_idx = labels.index("C3")
                self.c4_idx = labels.index("C4")

        if self.c3_idx is None:
            mapping = CHANNEL_MAPS.get(n_channels)
            if mapping:
                self.c3_idx = mapping["C3"]
                self.c4_idx = mapping["C4"]
            else:
                self.c3_idx = min(1, n_channels - 1)
                self.c4_idx = min(3, n_channels - 1)

        self.inlet = StreamInlet(info, processing_flags=proc_clocksync)
        print(f"[feedback] Connected to '{self.stream_name}' ({n_channels}ch, C3={self.c3_idx}, C4={self.c4_idx})")
        return True

    def _compute_band_power(self, data, band):
        if len(data) < self.window_samples // 2:
            return 0.0
        nperseg = min(len(data), int(self.srate))
        freqs, psd = welch(np.array(data), fs=self.srate, nperseg=nperseg, noverlap=nperseg // 2)
        mask = (freqs >= band[0]) & (freqs <= band[1])
        return float(np.mean(psd[mask])) if mask.any() else 0.0

    def _write_state(self, connected, stream_name, c3_mu, c4_mu, c3_beta, c4_beta, lat, suppression, error):
        self.writer.write({
            "timestamp": time.time(),
            "connected": connected,
            "stream_name": stream_name,
            "channels": {
                "C3": {"mu_power": round(c3_mu, 4), "beta_power": round(c3_beta, 4)},
                "C4": {"mu_power": round(c4_mu, 4), "beta_power": round(c4_beta, 4)},
            },
            "laterality_index": round(lat, 4),
            "mu_suppression": round(suppression, 4),
            "error": error,
        })

    def _write_disconnected(self, error_msg):
        self._write_state(False, None, 0, 0, 0, 0, 0, 0, error_msg)

    def run(self):
        print("[feedback] Starting feedback processor...")

        while self._running:
            if self.inlet is None:
                self._write_disconnected("Searching for EEG stream...")
                if not self._resolve_stream():
                    self._write_disconnected("No EEG stream found")
                    time.sleep(RETRY_INTERVAL)
                    continue

            try:
                samples, _ = self.inlet.pull_chunk(timeout=0.0, max_samples=self.window_samples)
            except Exception:
                self.inlet = None
                self._write_disconnected("Stream disconnected")
                continue

            if samples:
                for sample in samples:
                    self.buffer_c3.append(sample[self.c3_idx])
                    self.buffer_c4.append(sample[self.c4_idx])

            if len(self.buffer_c3) >= self.window_samples // 2:
                c3_mu = self._compute_band_power(self.buffer_c3, MU_BAND)
                c4_mu = self._compute_band_power(self.buffer_c4, MU_BAND)
                c3_beta = self._compute_band_power(self.buffer_c3, BETA_BAND)
                c4_beta = self._compute_band_power(self.buffer_c4, BETA_BAND)

                if self.baseline_mu_mean is None:
                    self.baseline_mu_values.append((c3_mu + c4_mu) / 2.0)
                    if len(self.baseline_mu_values) >= int(BASELINE_DURATION / UPDATE_INTERVAL):
                        self.baseline_mu_mean = np.mean(self.baseline_mu_values)
                        print(f"[feedback] Baseline established: {self.baseline_mu_mean:.4f}")

                denom = c3_mu + c4_mu
                lat = (c4_mu - c3_mu) / denom if denom > 0 else 0.0

                if self.baseline_mu_mean and self.baseline_mu_mean > 0:
                    current_mu = (c3_mu + c4_mu) / 2.0
                    suppression = 1.0 - (current_mu / self.baseline_mu_mean)
                    suppression = max(0.0, min(1.0, suppression))
                else:
                    suppression = 0.0

                self._write_state(True, self.stream_name, c3_mu, c4_mu, c3_beta, c4_beta, lat, suppression, None)
            else:
                self._write_state(True, self.stream_name, 0, 0, 0, 0, 0, 0, "Buffering...")

            time.sleep(UPDATE_INTERVAL)

        print("[feedback] Shutting down.")


def main():
    parser = argparse.ArgumentParser(description="EEG Feedback Processor")
    parser.add_argument("--config", required=True, help="Path to config.json")
    args = parser.parse_args()
    processor = FeedbackProcessor(args.config)
    processor.run()


if __name__ == "__main__":
    main()
