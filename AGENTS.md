# HELIN - Brain-Computer Interface Capstone

## Project Overview

HELIN is a BCI capstone for motor-imagery EEG collection, XDF inspection, offline
classification, and Bluetooth rover control. The current integrated control path
classifies recorded XDF windows and sends short movement commands to an ESP32
rover over Bluetooth Serial.

## Tech Stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui, Recharts
- Backend: Python, PsychoPy, pylsl, pyxdf, NumPy, SciPy, MNE, scikit-learn
- Hardware: g.tec Unicorn EEG headset, LabRecorder, ESP32 WROOM rover
- Rover transport: ESP32 Bluetooth Serial exposed to Windows as a COM port

## Directory Structure

```text
src/frontend/                  Next.js app
  src/app/api/start/           Spawn/stop PsychoPy collection
  src/app/api/status/          Session status polling
  src/app/api/streams/         LSL stream discovery
  src/app/api/recordings/      XDF listing, upload, and loading
  src/app/api/predictions/     Offline MI classification from XDF
  src/app/api/rover/send/      Bluetooth rover command bridge
  src/app/                     Home workspace selector
  src/app/collection/          MI collection interface
  src/app/viewer/              XDF visualization interface
  src/app/inference/           Translated EEG robot interface
  src/components/              App UI components
src/backend/
  mi_stimulus.py               PsychoPy MI collection protocol
  feedback.py                  Live feedback helper
  check_streams.py             LSL stream discovery helper
  read_xdf.py                  XDF-to-JSON viewer data extraction
  eeg_prediction.py            XDF classification pipeline
  rover_bridge.py              Bluetooth Serial command sender
  models/complete_model.pkl    Saved FBCSP/scaler/classifier bundle
src/rover_code/
  rover_code.ino               ESP32 firmware
  rover_control.py             Manual Bluetooth rover tester
data/                          Main XDF recording directory, including data/demo samples
legacy/Test_App/               Legacy pygame prototype/reference code
tmp/                           Runtime status/config files
```

## Common Commands

```bash
# Python environment
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# Frontend
cd src/frontend
npm install
npm run dev
npm run lint

# Manual prediction from a recording
python src/backend/eeg_prediction.py "data/sub-001/ses-S001/eeg/example.xdf"

# Manual rover command over Bluetooth Serial
python src/backend/rover_bridge.py LEFT --port COM11 --duration 2
python src/rover_code/rover_control.py --port COM11
```

## Control Architecture

The collection path is live LSL: `mi_stimulus.py` emits `MI_Markers`, the EEG
device emits EEG, and LabRecorder saves both into XDF.

The current rover-control path has two XDF-based modes:

- Offline review: classify windows, let the user inspect them, and send a
  selected command manually.
- Realtime replay: classify the XDF windows first, then step through them at
  wall-clock speed. Every 6-second window automatically sends one 2-second
  Bluetooth rover command and logs the exact byte sent.

The shared prediction pipeline is:

1. The inference page selects an XDF recording.
2. `/api/predictions` runs `src/backend/eeg_prediction.py`.
3. The classifier reads EEG and marker streams from the XDF file.
4. Each prediction window is 6 seconds.
5. Each 6-second window is split into three 2-second classifier segments.
6. Segment predictions are majority-voted into one window prediction.
7. The predicted class is mapped to a rover byte:
   - `LEFT` -> `L`
   - `RIGHT` -> `R`
   - `REST`, `UNKNOWN`, low-confidence fallback -> `S`
8. Manual or realtime replay calls `/api/rover/send`, which runs
   `src/backend/rover_bridge.py`, opens the paired
   Bluetooth COM port, sends the movement byte, waits 2 seconds, then sends `S`.
9. ESP32 firmware also stops automatically after 2.5 seconds if the stop byte is
   missed.

This means every 6 seconds of EEG produces one rover pulse that lasts 2 seconds.
The app does not yet classify a live LSL stream directly; true live online
inference would require a backend `pylsl.StreamInlet` loop using the same
preprocessing/model code.

## Conventions

- Keep Python backend scripts runnable from the repo root.
- Keep API routes in Node runtime when they use `child_process`.
- Do not hardcode participant data or hardware ports in UI code when an env var
  or request field can carry it.
- Use XDF as the source of truth for aligned EEG and markers.
- Treat `legacy/Test_App` as reference material only. New integrated code belongs
  in `src/backend`, `src/frontend`, or `src/rover_code`.
