export interface ExperimentConfig {
  participant_id: string;
  session_number: number;
  run_number: number;
  device_frequency: number;
  fullscreen: boolean;
  screen: number;
  show_feedback: boolean;
  notes: string;
  colors: {
    left: string;
    right: string;
  };
  timing: {
    baseline: number;
    cue: number;
    mi: number;
    rest_min: number;
    rest_max: number;
  };
  blocks: {
    num_blocks: number;
    trials_per_block: number;
    practice_trials: number;
    break_duration: number;
  };
}

export interface SessionStatus {
  state: "idle" | "practice" | "running" | "break" | "completed" | "aborted";
  phase: "baseline" | "cue" | "mi" | "rest" | "break" | "none";
  current_trial: number;
  total_trials: number;
  current_block: number;
  total_blocks: number;
  bad_trials: number;
  elapsed_seconds: number;
  output_file: string;
}

export interface ChannelFeedback {
  mu_power: number;
  beta_power: number;
}

export interface FeedbackData {
  timestamp: number;
  connected: boolean;
  stream_name: string | null;
  channels: {
    C3: ChannelFeedback;
    C4: ChannelFeedback;
  };
  laterality_index: number;
  mu_suppression: number;
  error: string | null;
}

export interface LSLStream {
  name: string;
  type: string;
  channels: number;
  srate: number;
  source_id: string;
}

export const DEFAULT_CONFIG: ExperimentConfig = {
  participant_id: "",
  session_number: 1,
  run_number: 1,
  device_frequency: 250,
  fullscreen: false,
  screen: 0,
  show_feedback: false,
  notes: "",
  colors: {
    left: "#4A9FD9",
    right: "#E8B931",
  },
  timing: {
    baseline: 2.0,
    cue: 1.0,
    mi: 4.0,
    rest_min: 2.0,
    rest_max: 3.0,
  },
  blocks: {
    num_blocks: 2,
    trials_per_block: 50,
    practice_trials: 10,
    break_duration: 120,
  },
};
