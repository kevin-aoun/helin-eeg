"""Bluetooth Serial bridge for the ESP32 rover.

Windows exposes the paired ESP32 Bluetooth SPP device as a COM port. This
script writes one movement byte, waits for the requested duration, then sends a
stop byte. It can also be used manually from a terminal.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Dict

import serial


COMMAND_BYTES: Dict[str, str] = {
    "LEFT": "L",
    "L": "L",
    "RIGHT": "R",
    "R": "R",
    "FORWARD": "F",
    "F": "F",
    "BACKWARD": "B",
    "B": "B",
    "REST": "S",
    "STOP": "S",
    "S": "S",
    "UNKNOWN": "S",
}


def normalize_command(command: str) -> str:
    return COMMAND_BYTES.get(str(command).strip().upper(), "S")


def send_command(port: str, command: str, duration_sec: float, baud: int = 115200, timeout: float = 1.0) -> Dict[str, object]:
    movement = normalize_command(command)
    duration = max(0.0, float(duration_sec))

    with serial.Serial(port, baud, timeout=timeout) as bt:
        bt.write(movement.encode("ascii"))
        bt.flush()
        if duration > 0 and movement != "S":
            time.sleep(duration)
            bt.write(b"S")
            bt.flush()

    return {
        "port": port,
        "baud": baud,
        "command": command,
        "byte": movement,
        "duration_sec": duration,
        "stopped_after_duration": duration > 0 and movement != "S",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Send one command to the ESP32 rover over Bluetooth Serial.")
    parser.add_argument("command", help="LEFT, RIGHT, FORWARD, BACKWARD, REST/STOP, or a raw L/R/F/B/S byte")
    parser.add_argument("--port", default=os.environ.get("ROVER_BT_PORT", "COM11"))
    parser.add_argument("--baud", type=int, default=int(os.environ.get("ROVER_BT_BAUD", "115200")))
    parser.add_argument("--duration", type=float, default=float(os.environ.get("ROVER_COMMAND_SECONDS", "2.0")))
    try:
        args = parser.parse_args()
        result = send_command(args.port, args.command, args.duration, args.baud)
        print(json.dumps(result))
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
