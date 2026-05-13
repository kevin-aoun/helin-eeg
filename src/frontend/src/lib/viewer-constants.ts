import type { MarkerTypeConfig } from "./types";

export const MARKER_CONFIG: Record<string, MarkerTypeConfig> = {
  // Labels
  left_hand:      { label: "Left Hand",      color: "#3b82f6", group: "Labels" },
  right_hand:     { label: "Right Hand",      color: "#f59e0b", group: "Labels" },
  // Trial Events
  fixation_onset: { label: "Fixation",        color: "#ec4899", group: "Trial Events" },
  cue_onset:      { label: "Cue Onset",       color: "#f43f5e", group: "Trial Events" },
  cue_offset:     { label: "Cue Offset",      color: "#fb7185", group: "Trial Events" },
  mi_start:       { label: "MI Start",        color: "#22c55e", group: "Trial Events" },
  mi_end:         { label: "MI End",          color: "#86efac", group: "Trial Events" },
  // Quality
  bad_trial:      { label: "Bad Trial",       color: "#ef4444", group: "Quality" },
  good_trial:     { label: "Good Trial",      color: "#a3e635", group: "Quality" },
  // Session
  session_start:  { label: "Session Start",   color: "#8b5cf6", group: "Session" },
  session_end:    { label: "Session End",     color: "#a78bfa", group: "Session" },
  block_start:    { label: "Block Start",     color: "#6366f1", group: "Session" },
  block_end:      { label: "Block End",       color: "#818cf8", group: "Session" },
};

export const MARKER_GROUPS = ["Labels", "Trial Events", "Quality", "Session"] as const;

export const ZOOM_LEVELS = [
  { label: "2s",  seconds: 2 },
  { label: "5s",  seconds: 5 },
  { label: "10s", seconds: 10 },
  { label: "30s", seconds: 30 },
  { label: "All", seconds: Infinity },
] as const;

export const DEFAULT_ZOOM_SECONDS = 10;
export const DEFAULT_AMPLITUDE_GAIN = 1.0;

export const CHANNEL_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
];
