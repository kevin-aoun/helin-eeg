"""Read an XDF file and output downsampled EEG + markers as JSON.

Usage:
    python read_xdf.py <xdf_file_path>
"""
import json
import sys

import numpy as np
import pyxdf

TARGET_POINTS = 5000

# Default channel labels when XDF metadata lacks them
CHANNEL_LABELS = {
    8: ["Fz", "C3", "Cz", "C4", "Pz", "PO7", "Oz", "PO8"],  # g.tec Unicorn
    14: ["Fp1", "Fp2", "F3", "Fz", "F4", "C3", "Cz", "C4", "P3", "Pz", "P4", "O1", "Oz", "O2"],
    32: [f"Ch{i + 1}" for i in range(32)],
}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python read_xdf.py <xdf_file_path>"}))
        sys.exit(1)

    filepath = sys.argv[1]

    try:
        streams, _ = pyxdf.load_xdf(filepath)
    except Exception as e:
        print(json.dumps({"error": f"Failed to load XDF: {e}"}))
        sys.exit(1)

    eeg_stream = None
    marker_stream = None

    for s in streams:
        srate = float(s["info"]["nominal_srate"][0])
        if srate > 0 and eeg_stream is None:
            eeg_stream = s
        elif srate == 0:
            marker_stream = s

    if eeg_stream is None:
        print(json.dumps({"error": "No EEG stream found in XDF file"}))
        sys.exit(1)

    # Extract channel names
    channels = []
    try:
        ch_list = eeg_stream["info"]["desc"][0]["channels"][0]["channel"]
        for ch in ch_list:
            channels.append(ch["label"][0])
    except Exception:
        n_ch = eeg_stream["time_series"].shape[1]
        channels = CHANNEL_LABELS.get(n_ch, [f"Ch{i + 1}" for i in range(n_ch)])

    data = eeg_stream["time_series"]  # (N, n_channels)
    timestamps = eeg_stream["time_stamps"]  # (N,)
    srate = float(eeg_stream["info"]["nominal_srate"][0])
    t0 = float(timestamps[0])
    total_samples = len(timestamps)

    # Downsample via strided indexing
    if total_samples > TARGET_POINTS:
        step = total_samples / TARGET_POINTS
        indices = np.round(np.arange(0, total_samples, step)).astype(int)
        indices = indices[indices < total_samples]
        data = data[indices]
        timestamps = timestamps[indices]

    # Normalize time to start at 0
    time_axis = (timestamps - t0).tolist()

    # Build per-channel arrays
    eeg = {"time": time_axis}
    for i, ch_name in enumerate(channels):
        eeg[ch_name] = data[:, i].tolist()

    # Extract markers
    markers = []
    if marker_stream is not None:
        for ts, sample in zip(
            marker_stream["time_stamps"], marker_stream["time_series"]
        ):
            label = sample[0] if isinstance(sample[0], str) else str(sample[0])
            markers.append({"time": round(float(ts - t0), 4), "label": label})

    original_duration = float(eeg_stream["time_stamps"][-1] - t0)

    result = {
        "channels": channels,
        "srate": srate,
        "duration": round(original_duration, 2),
        "total_samples": int(len(eeg_stream["time_stamps"])),
        "samples_returned": len(time_axis),
        "eeg": eeg,
        "markers": markers,
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
