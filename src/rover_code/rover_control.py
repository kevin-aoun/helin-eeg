import argparse
import sys
import time

import serial

PORT = "COM11"
BAUD = 115200
VALID_COMMANDS = {"F", "B", "L", "R", "S"}


def send_once(port: str, command: str, duration: float) -> None:
    cmd = command.strip().upper()
    if cmd not in VALID_COMMANDS:
        raise ValueError("Command must be F, B, L, R, or S.")

    with serial.Serial(port, BAUD, timeout=1) as bt:
        bt.write(cmd.encode("ascii"))
        print(f"Sent: {cmd}")
        if cmd != "S" and duration > 0:
            time.sleep(duration)
            bt.write(b"S")
            print("Sent: S")


def interactive(port: str) -> None:
    try:
        bt = serial.Serial(port, BAUD, timeout=1)
        print(f"Connected to {port}")
    except serial.SerialException as e:
        print(f"Could not open {port}: {e}")
        sys.exit(1)

    print("Commands: F = forward | B = backward | L = left | R = right | S = stop | Q = quit")

    try:
        while True:
            cmd = input("> ").strip().upper()
            if not cmd:
                continue
            if cmd == "Q":
                bt.write(b"S")
                break
            if cmd in VALID_COMMANDS:
                bt.write(cmd.encode())
                print(f"Sent: {cmd}")
            else:
                print("Unknown command. Use F, B, L, R, S, or Q.")
    except KeyboardInterrupt:
        bt.write(b"S")
    finally:
        bt.close()
        print("Disconnected.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Manual ESP32 rover Bluetooth control.")
    parser.add_argument("--port", default=PORT)
    parser.add_argument("--command", help="Optional one-shot command: F, B, L, R, or S.")
    parser.add_argument("--duration", type=float, default=2.0)
    args = parser.parse_args()

    if args.command:
        try:
            send_once(args.port, args.command, args.duration)
        except (ValueError, serial.SerialException) as exc:
            print(exc)
            sys.exit(1)
        return

    interactive(args.port)


if __name__ == "__main__":
    main()
