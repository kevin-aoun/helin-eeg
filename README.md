# HELIN Knowledge Base

> **Humanity's Last Interface** — BCI Capstone Project
> LAU School of Engineering | February 2026

---

*Disclaimer: AI was used to help write those reports, and it has been manually reviewed. Changes may apply.*

## Project Scope

| Objective                   | Task                       | Hardware              | Data Source                            | Approach                                 |
| --------------------------- | -------------------------- | --------------------- | -------------------------------------- | ---------------------------------------- |
| **1. Motor Imagery**  | LH/RH Classification       | g.tec Unicorn (Dubai) | Custom: 3-5 subjects × 100-150 trials | LaBraM + LoRA                            |
| **2. Epilepsy**       | Spike Detection            | Hospital EEG          | Unlabeled patient + public datasets    | 3-stage pipeline + video artifact filter |
| **3. Fear Detection** | 5-level threshold (0-100%) | Emotiv Epoc X         | SEED/DEAP/FACED → Custom gaming       | Transfer learning + LoRA                 |

**Hot-swappable adapters:** All three objectives share the same LaBraM base model with task-specific LoRA adapters (~2MB each).

---

## Dashboard Interface

![HELIN Dashboard](docs/image/README/1771259593942.png)

The HELIN dashboard is a web-based interface for running motor imagery (MI) data collection sessions. It controls a PsychoPy stimulus script and displays real-time session progress. The left panel lets you configure the experiment (participant ID, session/run numbers, timing, block structure, and visual cue colors). The right panel shows a live session monitor with trial count, elapsed time, and a neurofeedback visualization.

## How to Use

1. **Configure the session**: specify the participant ID, session number, and run number in the Session card.
2. **Start the session**: click "Start Session" to launch the PsychoPy stimulus script. It will stream event markers (e.g. `left_hand`, `right_hand`, `baseline`) over LSL under the stream name `MI_Markers`.
3. **Open LabRecorder**: download [LabRecorder](https://github.com/labstreaminglayer/App-LabRecorder) and launch it. It will automatically discover available LSL streams on the network.
4. **Select streams**: in LabRecorder, check the **MI_Markers** stream and the **EEG stream** from your device (e.g. `UN-2019.05.51` for the Unicorn).
5. **Record**: press "Start" in LabRecorder to begin recording, then proceed with the experiment in the HELIN dashboard.
6. **Stop**: when the session ends (or you press ESC to abort), stop LabRecorder. The XDF file is saved automatically to the LabRecorder output directory.

---

## Quick Reference Tables

### 1. Hardware Specs

| Device                  | Channels        | Fs     | Resolution | Best For         | Your Access |
| ----------------------- | --------------- | ------ | ---------- | ---------------- | ----------- |
| **g.tec Unicorn** | 8 (C3,Cz,C4...) | 250 Hz | 24-bit     | MI (Obj 1)       | ✅ Dubai    |
| **Emotiv Epoc X** | 14              | 128 Hz | 14-bit     | Emotion (Obj 3)  | ✅ Lebanon  |
| **Hospital EEG**  | 19-64           | 256 Hz | 16-24 bit  | Epilepsy (Obj 2) | ✅ Hospital |

→ Details: [docs/01_HARDWARE.md](docs/01_HARDWARE.md)

### 2. Frequency Bands

| Band                 | Hz     | Use Case                |
| -------------------- | ------ | ----------------------- |
| **Mu (µ)**    | 8-13   | Motor imagery (ERD/ERS) |
| **Beta (β)**  | 13-30  | Motor planning          |
| **Theta (θ)** | 4-8    | Emotion, memory         |
| **Alpha (α)** | 8-13   | Relaxation, attention   |
| **Gamma (γ)** | 30-100 | Fear, cognitive load    |

### 3. Model Selection

| Model                     | Parameters  | Min Samples       | Expected Acc   | Status              |
| ------------------------- | ----------- | ----------------- | -------------- | ------------------- |
| **EEGNet**          | 2.6K        | 200-500           | 75-82%         | ✅ Baseline         |
| **MBHNN (no attn)** | 300K        | 1,000+            | 80-86%         | ✅ Works            |
| **MBHNN (w/ attn)** | 500K        | 5,000+            | 67% (overfit!) | ⚠️ Avoid          |
| **LaBraM + LoRA**   | 5.8M + ~50K | **300-500** | 80-90%         | ✅**Primary** |

**⚠️ Attention fails with <5,000 samples** → Use LaBraM + LoRA instead

→ Details: [docs/04_MODEL_SELECTION.md](docs/04_MODEL_SELECTION.md)

### 4. LaBraM Data Requirements

| Scenario                 | Samples     | Subjects | Expected Result |
| ------------------------ | ----------- | -------- | --------------- |
| **Minimum viable** | 300-500     | 3-5      | ~75-80%         |
| **Comfortable**    | 500-1,000   | 5-10     | ~80-85%         |
| **Optimal**        | 1,000-2,000 | 10-15    | ~85-90%         |

*LaBraM works with small data because it's pre-trained on 2,500 hours of EEG*

→ Details: [docs/05_LABRAM.md](docs/05_LABRAM.md)

### 5. Public Datasets

| Dataset             | Subjects | Ch  | Fs      | Task              | Link                                               |
| ------------------- | -------- | --- | ------- | ----------------- | -------------------------------------------------- |
| **BCI IV 2a** | 9        | 22  | 250 Hz  | MI (4-class)      | [BNCI](http://bnci-horizon-2020.eu/)                  |
| **PhysioNet** | 109      | 64  | 160 Hz  | MI                | [PhysioNet](https://physionet.org/content/eegmmidb/)  |
| **SEED**      | 15       | 62  | 1000 Hz | Emotion (3)       | [BCMI](https://bcmi.sjtu.edu.cn/home/seed/)           |
| **SEED-IV**   | 15       | 62  | 1000 Hz | Emotion (4+fear)  | [BCMI](https://bcmi.sjtu.edu.cn/home/seed/)           |
| **DEAP**      | 32       | 32  | 128 Hz  | Emotion (4D)      | [QMUL](http://www.eecs.qmul.ac.uk/mmv/datasets/deap/) |
| **FACED**     | 123      | 32  | 250 Hz  | Emotion (9)       | [Synapse](https://doi.org/10.7303/syn50614194)        |
| **Bonn**      | 5 sets   | 1   | 173 Hz  | Epilepsy          | [Bonn](https://www.ukbonn.de/)                        |
| **CHB-MIT**   | 23       | 23  | 256 Hz  | Epilepsy (198 sz) | [PhysioNet](https://physionet.org/content/chbmit/)    |
| **TUSZ**      | 592      | Var | 250+ Hz | Epilepsy (types)  | [TUH](https://isip.piconepress.com/projects/tuh_eeg/) |


---

## References

1. **Lawhern et al. (2018)** — EEGNet — [DOI](https://doi.org/10.1088/1741-2552/aace8c)
2. **Ma et al. (2022)** — MBHNN — [DOI](https://doi.org/10.1016/j.bspc.2022.103718)
3. **Jiang et al. (2024)** — LaBraM — [arXiv](https://arxiv.org/abs/2405.18765) ⭐
4. **Schulman et al. (2025)** — LoRA Without Regret — [Thinking Machines](https://thinkingmachines.ai/blog/lora/) ⭐
5. **Hu et al. (2021)** — LoRA — [arXiv](https://arxiv.org/abs/2106.09685)
6. **Koelstra et al. (2012)** — DEAP — [IEEE](https://doi.org/10.1109/T-AFFC.2011.15)
7. **Li et al. (2023)** — FACED — [Scientific Data](https://doi.org/10.1038/s41597-023-02650-w)
8. **Shoeb & Guttag (2010)** — CHB-MIT — [PhysioNet](https://physionet.org/content/chbmit/)
9. **Shah et al. (2018)** — TUSZ — [arXiv](https://arxiv.org/abs/1801.08085)

---

*Last updated: February 2026*
