"""
Motor Imagery Stimulus Presentation & Auto-Labeler

Presents visual cues (fixation cross, directional arrows) for MI data collection.
Pushes event markers via LSL so they are clock-synchronized with the EEG stream.
Also writes a backup CSV marker file.

Recording setup:
    1. Start the Unicorn LSL stream (via Unicorn Suite or UnicornLSL)
    2. Open LabRecorder, select BOTH the EEG stream and "MI_Markers"
    3. Press Record in LabRecorder
    4. Run this script
    5. Stop LabRecorder → produces a single .xdf with aligned EEG + markers

Usage:
    python mi_stimulus.py --config path/to/config.json

Controls:
    B     - Flag current trial as bad
    ESC   - Abort session (saves data collected so far)
    SPACE - Continue past break / instruction screens

Requirements:
    pip install psychopy pylsl
"""

import argparse
import csv
import json
import os
import random
import sys
import time
from datetime import datetime

try:
    from pylsl import StreamInfo, StreamOutlet
except ImportError:
    print(
        "\n[ERROR] pylsl is required but not installed.\n"
        "\n"
        "  LSL (Lab Streaming Layer) is needed so that event markers share\n"
        "  the same clock as the EEG stream. Without it, timestamps in the\n"
        "  marker CSV cannot be aligned with the EEG recording.\n"
        "\n"
        "  Install it with:  pip install pylsl\n",
        file=sys.stderr,
    )
    sys.exit(1)

# ── Marker Codes (matching 02_DATA_COLLECTION.md) ──────────────────────────

MARKERS = {
    1: "session_start",
    2: "session_end",
    10: "block_start",
    11: "block_end",
    20: "fixation_onset",
    21: "cue_onset",
    22: "cue_offset",
    23: "mi_start",
    24: "mi_end",
    100: "left_hand",
    101: "right_hand",
    200: "bad_trial",
    201: "good_trial",
}


# ── Marker Writer ──────────────────────────────────────────────────────────

class MarkerWriter:
    """Pushes markers via LSL and writes a backup CSV."""

    def __init__(self, filepath: str):
        # LSL outlet — cf_string format is the LSL convention for event markers
        lsl_info = StreamInfo(
            "MI_Markers", "Markers", 1, 0, "string", "mi_markers_001"
        )
        self._outlet = StreamOutlet(lsl_info)

        # Backup CSV — useful for quick inspection, but NOT for epoching
        self._start_time = time.perf_counter()
        self._file = open(filepath, "w", newline="")
        self._writer = csv.writer(self._file)
        self._writer.writerow(
            ["timestamp", "marker_code", "marker_label", "trial_number", "block_number"]
        )

    def write(self, code: int, trial_num: int = 0, block_num: int = 0):
        # Push to LSL as string label (e.g. "left_hand", "cue_onset")
        label = MARKERS.get(code, f"unknown_{code}")
        self._outlet.push_sample([label])

        # Also write to backup CSV
        elapsed = time.perf_counter() - self._start_time
        label = MARKERS.get(code, f"unknown_{code}")
        self._writer.writerow(
            [f"{elapsed:.6f}", code, label, trial_num, block_num]
        )
        self._file.flush()

    def close(self):
        self._file.close()


# ── Status Writer ──────────────────────────────────────────────────────────

class StatusWriter:
    """Writes status.json for frontend polling."""

    def __init__(self, filepath: str):
        self._filepath = filepath

    def update(
        self,
        state: str,
        phase: str,
        current_trial: int,
        total_trials: int,
        current_block: int,
        total_blocks: int,
        bad_trials: int,
        elapsed_seconds: float,
        output_file: str,
    ):
        data = {
            "state": state,
            "phase": phase,
            "current_trial": current_trial,
            "total_trials": total_trials,
            "current_block": current_block,
            "total_blocks": total_blocks,
            "bad_trials": bad_trials,
            "elapsed_seconds": elapsed_seconds,
            "output_file": output_file,
        }
        # Write atomically to avoid partial reads
        tmp_path = self._filepath + ".tmp"
        with open(tmp_path, "w") as f:
            json.dump(data, f)
        os.replace(tmp_path, self._filepath)


# ── MI Experiment ──────────────────────────────────────────────────────────

class MIExperiment:
    """Motor Imagery experiment controller using PsychoPy."""

    def __init__(self, config_path: str):
        with open(config_path) as f:
            self.config = json.load(f)

        # Extract config
        self.participant_id = self.config["participant_id"]
        self.session_num = self.config["session_number"]
        self.run_num = self.config.get("run_number", 1)
        self.device_freq = self.config["device_frequency"]
        self.timing = self.config["timing"]
        self.blocks_cfg = self.config["blocks"]

        # Build output path
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        data_dir = os.path.join(project_root, "data")
        tmp_dir = os.path.join(project_root, "tmp")
        os.makedirs(data_dir, exist_ok=True)
        os.makedirs(tmp_dir, exist_ok=True)

        date_str = datetime.now().strftime("%Y%m%d")
        self.output_file = os.path.join(
            data_dir,
            f"{self.participant_id}_{date_str}_S{self.session_num}_R{self.run_num}_MI_markers.csv",
        )
        self.output_filename = os.path.basename(self.output_file)

        # Save session notes if provided
        notes = self.config.get("notes", "").strip()
        if notes:
            notes_file = self.output_file.replace("_MI_markers.csv", "_notes.txt")
            with open(notes_file, "w") as f:
                f.write(f"Participant: {self.participant_id}\n")
                f.write(f"Session: S{self.session_num}\n")
                f.write(f"Date: {date_str}\n")
                f.write(f"Device: {self.device_freq} Hz\n\n")
                f.write(notes + "\n")

        self.markers = MarkerWriter(self.output_file)
        self.status = StatusWriter(os.path.join(tmp_dir, "status.json"))

        self.bad_trials = 0
        self.aborted = False
        self._session_start = time.perf_counter()
        self._last_trial = 0
        self._last_block = 0
        self._last_total_trials = 0

        # ── PsychoPy setup ─────────────────────────────────────────────
        from psychopy import visual, core, event

        self._core = core
        self._event = event

        use_fullscr = self.config.get("fullscreen", False)
        screen_num = self.config.get("screen", 0)
        win_size = [1024, 768] if not use_fullscr else None
        self.win = visual.Window(
            size=win_size,
            fullscr=use_fullscr,
            screen=screen_num,
            color="black",
            units="height",
        )

        # Class colors from config (hex strings like "#4A9FD9")
        colors = self.config.get("colors", {})
        self.color_left = colors.get("left", "#4A9FD9")
        self.color_right = colors.get("right", "#E8B931")

        self.fixation = visual.TextStim(
            self.win, text="+", height=0.15, color="white"
        )
        self.arrow_left = visual.TextStim(
            self.win, text="\u2190", height=0.25, color=self.color_left, bold=True
        )
        self.arrow_right = visual.TextStim(
            self.win, text="\u2192", height=0.25, color=self.color_right, bold=True
        )
        self.message = visual.TextStim(
            self.win, text="", height=0.05, color="white", wrapWidth=1.5
        )
        self.progress_text = visual.TextStim(
            self.win,
            text="",
            height=0.03,
            color="gray",
            pos=(0, -0.45),
        )

        self.show_feedback = self.config.get("show_feedback", False)
        self.feedback_ring = visual.Circle(
            self.win,
            radius=0.08,
            edges=64,
            lineWidth=3,
            lineColor="white",
            fillColor=None,
            opacity=0.0,
        )
        self._feedback_path = os.path.join(tmp_dir, "feedback.json")

        self.clock = core.Clock()

    # ── Helpers ────────────────────────────────────────────────────────

    def _elapsed(self) -> float:
        return time.perf_counter() - self._session_start

    def _update_status(self, state: str, phase: str, trial: int, block: int, total_trials: int):
        # Track last known position for abort summary
        if trial > 0:
            self._last_trial = trial
        if block > 0:
            self._last_block = block
        if total_trials > 0:
            self._last_total_trials = total_trials

        self.status.update(
            state=state,
            phase=phase,
            current_trial=trial,
            total_trials=total_trials,
            current_block=block,
            total_blocks=self.blocks_cfg["num_blocks"],
            bad_trials=self.bad_trials,
            elapsed_seconds=self._elapsed(),
            output_file=self.output_filename,
        )

    def _read_feedback(self) -> float:
        """Read mu_suppression from feedback.json. Returns 0.0 on any error."""
        try:
            with open(self._feedback_path, "r") as f:
                data = json.load(f)
            if data.get("connected") and data.get("mu_suppression") is not None:
                return float(data["mu_suppression"])
        except (FileNotFoundError, json.JSONDecodeError, KeyError, ValueError, OSError):
            pass
        return 0.0

    def _wait(self, duration: float) -> bool:
        """Wait for duration, polling for ESC every ~16ms. Returns True if ESC pressed."""
        self.clock.reset()
        while self.clock.getTime() < duration:
            keys = self._event.getKeys(keyList=["escape"])
            if "escape" in keys:
                return True
            self._core.wait(0.016)
        return False

    def _show_message_and_wait(self, text: str):
        """Show a message and wait for SPACE. Sets self.aborted if ESC."""
        self.message.text = text
        self.message.draw()
        self.win.flip()
        self._event.clearEvents()
        keys = self._event.waitKeys(keyList=["space", "escape"])
        if keys and "escape" in keys:
            self.aborted = True

    def _draw_progress(self, trial: int, total: int, block: int):
        """Draw small progress text at bottom."""
        self.progress_text.text = (
            f"Trial {trial}/{total}  |  Block {block}/{self.blocks_cfg['num_blocks']}"
        )
        self.progress_text.draw()

    # ── Trial Logic ────────────────────────────────────────────────────

    def run_trial(
        self, direction: str, trial_num: int, block_num: int, is_practice: bool
    ) -> bool:
        """Run a single MI trial. Returns True if ESC was pressed."""
        total_trials = self.blocks_cfg["trials_per_block"]
        state = "practice" if is_practice else "running"

        # Determine trial color
        trial_color = self.color_left if direction == "left" else self.color_right

        # ── Baseline (white fixation cross) ──
        if not is_practice:
            self.markers.write(20, trial_num, block_num)
        self._update_status(state, "baseline", trial_num, block_num, total_trials)

        self.fixation.color = "white"
        self.fixation.draw()
        self._draw_progress(trial_num, total_trials, block_num)
        self.win.flip()
        if self._wait(self.timing["baseline"]):
            return True

        # ── Cue (colored arrow) ──
        if not is_practice:
            self.markers.write(21, trial_num, block_num)
            self.markers.write(
                100 if direction == "left" else 101, trial_num, block_num
            )
        self._update_status(state, "cue", trial_num, block_num, total_trials)

        arrow = self.arrow_left if direction == "left" else self.arrow_right
        arrow.draw()
        self._draw_progress(trial_num, total_trials, block_num)
        self.win.flip()
        if self._wait(self.timing["cue"]):
            return True

        # ── Cue offset ──
        if not is_practice:
            self.markers.write(22, trial_num, block_num)

        # ── Motor Imagery (colored fixation cross + optional feedback ring) ──
        if not is_practice:
            self.markers.write(23, trial_num, block_num)
        self._update_status(state, "mi", trial_num, block_num, total_trials)

        self.fixation.color = trial_color
        self._event.clearEvents()
        self.clock.reset()
        while self.clock.getTime() < self.timing["mi"]:
            keys = self._event.getKeys(keyList=["escape"])
            if "escape" in keys:
                return True

            if self.show_feedback and not is_practice:
                suppression = self._read_feedback()
                self.feedback_ring.opacity = suppression * 0.6
            else:
                self.feedback_ring.opacity = 0.0

            if self.feedback_ring.opacity > 0.01:
                self.feedback_ring.draw()
            self.fixation.draw()
            self._draw_progress(trial_num, total_trials, block_num)
            self.win.flip()
            self._core.wait(0.016)

        # ── MI end ──
        self.fixation.color = "white"  # Reset for next baseline
        if not is_practice:
            self.markers.write(24, trial_num, block_num)

        # Check for bad trial flag (B key)
        keys = self._event.getKeys(keyList=["b"])
        if "b" in keys and not is_practice:
            self.markers.write(200, trial_num, block_num)
            self.bad_trials += 1
        elif not is_practice:
            self.markers.write(201, trial_num, block_num)

        # ── Rest (blank screen) ──
        self._update_status(state, "rest", trial_num, block_num, total_trials)
        self.win.flip()
        rest_dur = random.uniform(self.timing["rest_min"], self.timing["rest_max"])
        if self._wait(rest_dur):
            return True

        return False

    # ── Block Logic ────────────────────────────────────────────────────

    def run_block(self, block_num: int, is_practice: bool) -> bool:
        """Run a block of trials. Returns True if ESC was pressed."""
        trials_count = (
            self.blocks_cfg["practice_trials"]
            if is_practice
            else self.blocks_cfg["trials_per_block"]
        )
        half = trials_count // 2
        trials = ["left"] * half + ["right"] * (trials_count - half)
        random.shuffle(trials)

        if not is_practice:
            self.markers.write(10, 0, block_num)

        for i, direction in enumerate(trials, start=1):
            escaped = self.run_trial(direction, i, block_num, is_practice)
            if escaped:
                return True

        if not is_practice:
            self.markers.write(11, 0, block_num)

        return False

    # ── Session Logic ──────────────────────────────────────────────────

    def show_instructions(self):
        # ── Screen 1: Task explanation ──
        self._show_message_and_wait(
            "MOTOR IMAGERY TASK\n\n"
            "You will see a fixation cross (+), then an arrow\n"
            "pointing left (\u2190) or right (\u2192).\n\n"
            "When you see the arrow, imagine squeezing a ball\n"
            "with that hand. Don't actually move \u2014 just imagine\n"
            "the movement vividly.\n\n"
            "Keep imagining until the cross reappears.\n"
            "Try to stay relaxed and avoid blinking during\n"
            "the arrow and imagination periods.\n\n"
            "\n[ SPACE \u2192 next ]"
        )
        if self.aborted:
            return

        # ── Screen 2: Controls + session info ──
        self._show_message_and_wait(
            "CONTROLS\n\n"
            "SPACE    Continue / skip screens\n"
            "B        Flag current trial as bad\n"
            "ESC      Abort session (saves data)\n\n"
            "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n"
            f"Participant: {self.participant_id}  |  Session: S{self.session_num}  |  Run: R{self.run_num}\n"
            f"Device: {self.device_freq} Hz\n"
            f"Blocks: {self.blocks_cfg['num_blocks']} x {self.blocks_cfg['trials_per_block']} trials\n\n"
            "\u26a0  Make sure LabRecorder is recording\n"
            "   both the EEG stream and MI_Markers.\n\n"
            "\n[ SPACE \u2192 begin ]"
        )

    def show_break(self, block_num: int):
        self._update_status(
            "break", "break", 0, block_num,
            self.blocks_cfg["trials_per_block"],
        )
        break_mins = self.blocks_cfg.get("break_duration", 120) // 60
        break_label = f"{break_mins}-minute" if break_mins > 0 else "short"
        text = (
            f"Block {block_num} complete.\n\n"
            f"Take a {break_label} break.\n"
            "Check electrode impedance if needed.\n\n"
            "\n[ SPACE \u2192 continue ]"
        )
        self._show_message_and_wait(text)

    def show_end_screen(self):
        total_trials = self.blocks_cfg["trials_per_block"] * self.blocks_cfg["num_blocks"]
        state = "aborted" if self.aborted else "completed"
        self._write_final_status(state)

        if self.aborted:
            text = (
                f"Session ABORTED\n\n"
                f"Stopped at trial {self._last_trial}/{self._last_total_trials}"
                f"  (block {self._last_block}/{self.blocks_cfg['num_blocks']})\n"
                f"Bad trials flagged: {self.bad_trials}\n"
                f"Output: {self.output_filename}\n\n"
                "\n[ SPACE \u2192 exit ]"
            )
        else:
            text = (
                f"Session COMPLETE\n\n"
                f"Total trials: {total_trials}\n"
                f"Bad trials flagged: {self.bad_trials}\n"
                f"Output: {self.output_filename}\n\n"
                "\n[ SPACE \u2192 exit ]"
            )
        self._show_message_and_wait(text)

    def run(self):
        """Run the full experiment session."""
        try:
            self.show_instructions()
            if self.aborted:
                self.cleanup()
                return

            # ── Practice block ──
            if self.blocks_cfg["practice_trials"] > 0:
                self._update_status("practice", "none", 0, 0, self.blocks_cfg["practice_trials"])
                self._show_message_and_wait(
                    f"PRACTICE BLOCK\n\n"
                    f"{self.blocks_cfg['practice_trials']} practice trials\n"
                    f"(not recorded)\n\n"
                    f"\n[ SPACE \u2192 start practice ]"
                )
                if self.aborted:
                    self.cleanup()
                    return

                escaped = self.run_block(0, is_practice=True)
                if escaped:
                    self.aborted = True
                    self.cleanup()
                    return

                self._show_message_and_wait(
                    "Practice complete!\n\n"
                    "The real recording will now begin.\n\n"
                    "\n[ SPACE \u2192 start recording ]"
                )
                if self.aborted:
                    self.cleanup()
                    return

            # ── Recording blocks ──
            self.markers.write(1)  # session_start

            for block in range(1, self.blocks_cfg["num_blocks"] + 1):
                escaped = self.run_block(block, is_practice=False)
                if escaped:
                    self.aborted = True
                    break

                # Break between blocks (not after last)
                if block < self.blocks_cfg["num_blocks"]:
                    self.show_break(block)
                    if self.aborted:
                        break

            self.markers.write(2)  # session_end
            self.show_end_screen()

        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            self.aborted = True
        finally:
            self.cleanup()

    def _write_final_status(self, state: str):
        """Write final status preserving last known trial/block counts."""
        total = self._last_total_trials or self.blocks_cfg["trials_per_block"]
        self.status.update(
            state=state,
            phase="none",
            current_trial=self._last_trial,
            total_trials=total,
            current_block=self._last_block,
            total_blocks=self.blocks_cfg["num_blocks"],
            bad_trials=self.bad_trials,
            elapsed_seconds=self._elapsed(),
            output_file=self.output_filename,
        )

    def cleanup(self):
        """Close PsychoPy window and marker writer. Always saves data."""
        state = "aborted" if self.aborted else "completed"
        try:
            self._write_final_status(state)
        except Exception:
            pass
        try:
            self.markers.close()
        except Exception:
            pass
        try:
            self.win.close()
        except Exception:
            pass
        self._core.quit()


# ── Entry Point ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="MI Stimulus Presentation")
    parser.add_argument("--config", required=True, help="Path to config.json")
    args = parser.parse_args()

    exp = MIExperiment(args.config)
    exp.run()


if __name__ == "__main__":
    main()
