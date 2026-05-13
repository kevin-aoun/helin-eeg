"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Bluetooth, ChevronLeft, ChevronRight, Loader2, Play, Send, Square } from "lucide-react";
import { AppTopBar } from "@/components/app-top-bar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecordingSelector } from "@/components/viewer/recording-selector";
import type { PredictionResponse, PredictionSegment, PredictionWindow, RecordingsIndex } from "@/lib/types";

const LABEL_COLORS: Record<string, string> = {
  left: "text-blue-700 dark:text-blue-400",
  right: "text-orange-700 dark:text-orange-400",
  rest: "text-muted-foreground",
  unknown: "text-muted-foreground",
};

const COMMAND_LABELS: Record<string, string> = {
  L: "LEFT",
  R: "RIGHT",
  S: "STOP",
};

type CommandLogEntry = {
  id: number;
  mode: "manual" | "realtime";
  windowNumber: number;
  predicted: string;
  byte: string;
  duration: number;
  timestamp: string;
};

type Stats = {
  overallAccuracy: number;
  miAccuracy: number;
  restAccuracy: number;
  miCorrect: number;
  miTotal: number;
  restCorrect: number;
  restTotal: number;
  correct: number;
  wrong: number;
  scored: number;
  counts: Record<"left" | "right" | "rest", number>;
};

function normalizeLabel(label: string): "left" | "right" | "rest" | "unknown" {
  const value = String(label).trim().toLowerCase();
  if (value === "left" || value === "right" || value === "rest") return value;
  return "unknown";
}

function labelColor(label: string): string {
  return LABEL_COLORS[normalizeLabel(label)];
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function commandByteForLabel(label: string): string {
  const normalized = normalizeLabel(label);
  if (normalized === "left") return "L";
  if (normalized === "right") return "R";
  return "S";
}

function computeStats(windows: PredictionWindow[]): Stats {
  const counts = { left: 0, right: 0, rest: 0 };
  let correct = 0;
  let scored = 0;
  let miCorrect = 0;
  let miTotal = 0;
  let restCorrect = 0;
  let restTotal = 0;

  for (const window of windows) {
    const predicted = normalizeLabel(window.predicted_name);
    const expected = normalizeLabel(window.expected_name);
    if (predicted !== "unknown") counts[predicted] += 1;

    if (predicted === "unknown" || expected === "unknown") continue;
    scored += 1;
    if (predicted === expected) correct += 1;

    if (expected === "left" || expected === "right") {
      miTotal += 1;
      if (predicted === expected) miCorrect += 1;
    } else if (expected === "rest") {
      restTotal += 1;
      if (predicted === expected) restCorrect += 1;
    }
  }

  return {
    overallAccuracy: scored ? (correct / scored) * 100 : 0,
    miAccuracy: miTotal ? (miCorrect / miTotal) * 100 : 0,
    restAccuracy: restTotal ? (restCorrect / restTotal) * 100 : 0,
    miCorrect,
    miTotal,
    restCorrect,
    restTotal,
    correct,
    wrong: scored - correct,
    scored,
    counts,
  };
}

function ProbabilityBar({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className="grid grid-cols-[42px_1fr_44px] items-center gap-2 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
      </div>
      <span className="text-right text-muted-foreground">{formatPercent(value)}</span>
    </div>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-md border bg-card ${className}`}>
      <div className="border-b px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function CurrentWindowPanel({ item }: { item: PredictionWindow | null }) {
  if (!item) {
    return (
      <Panel title="Current Window" className="min-h-[330px]">
        <p className="text-sm text-muted-foreground">No window selected.</p>
      </Panel>
    );
  }

  const correct = item.correct;
  return (
    <Panel title="Current Window" className="min-h-[330px]">
      <div className="space-y-4">
        <div>
          <p className="text-[11px] text-muted-foreground">Start Time - End Time</p>
          <p className="text-sm font-semibold">
            {item.start_time.toFixed(2)}s - {item.end_time.toFixed(2)}s ({item.duration.toFixed(0)}-sec window)
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Expected</span>
            <span className={`font-semibold ${labelColor(item.expected_name)}`}>{item.expected_name.toUpperCase()}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Predicted</span>
            <span className={`font-semibold ${labelColor(item.predicted_name)}`}>{item.predicted_name.toUpperCase()}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Confidence</span>
            <span className="font-semibold text-blue-700 dark:text-blue-400">{formatPercent(item.confidence)}</span>
          </div>
        </div>

        <div className={`rounded-md border px-3 py-2 text-center text-xs font-semibold ${correct ? "border-emerald-600/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-red-600/50 bg-red-500/10 text-red-700 dark:text-red-400"}`}>
          {correct ? "MATCH" : "MISMATCH"}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold">Probabilities</p>
          <ProbabilityBar label="Left" value={item.probabilities.left} colorClass="bg-blue-700 dark:bg-blue-400" />
          <ProbabilityBar label="Right" value={item.probabilities.right} colorClass="bg-orange-700 dark:bg-orange-400" />
          <ProbabilityBar label="Rest" value={item.probabilities.rest} colorClass="bg-muted-foreground" />
        </div>
      </div>
    </Panel>
  );
}

function RobotPanel({ item, sending, onSend }: { item: PredictionWindow | null; sending: boolean; onSend: () => void }) {
  const predicted = item?.predicted_name.toUpperCase() ?? "UNKNOWN";
  const expected = item?.expected_name.toUpperCase() ?? "UNKNOWN";
  const normalized = normalizeLabel(predicted);
  const commandByte = item ? commandByteForLabel(item.predicted_name) : "S";

  return (
    <section className="rounded-md border bg-card min-h-[330px]">
      <div className="border-b px-3 py-3 text-center text-base font-semibold">
        Predicted: {predicted} <span className="mx-4 text-muted-foreground">|</span> Expected: {expected}
      </div>
      <div className="p-3">
        <div className="relative h-[245px] rounded-md border bg-muted/40 overflow-hidden">
          <div className="absolute inset-x-8 top-10 bottom-6 grid grid-cols-8 grid-rows-7">
            {Array.from({ length: 56 }).map((_, index) => (
              <div key={index} className="border border-border/80" />
            ))}
          </div>
          <div className="absolute left-8 top-8 text-sm font-semibold">LEFT</div>
          <div className="absolute left-1/2 -translate-x-1/2 top-8 text-sm font-semibold">REST</div>
          <div className="absolute right-8 top-8 text-sm font-semibold">RIGHT</div>

          {normalized === "left" && (
            <div className="absolute left-1/2 top-[58%] h-3 w-40 -translate-x-1/2 -translate-y-1/2 bg-foreground">
              <div className="absolute -left-7 -top-[18px] h-0 w-0 border-y-[24px] border-r-[30px] border-y-transparent border-r-foreground" />
            </div>
          )}
          {normalized === "right" && (
            <div className="absolute left-1/2 top-[58%] h-3 w-40 -translate-x-1/2 -translate-y-1/2 bg-foreground">
              <div className="absolute -right-7 -top-[18px] h-0 w-0 border-y-[24px] border-l-[30px] border-y-transparent border-l-foreground" />
            </div>
          )}
          {normalized === "rest" && (
            <div className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 text-sm font-semibold">
              DO NOTHING
            </div>
          )}
          {normalized === "unknown" && (
            <div className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
              No robot command
            </div>
          )}

          <Button
            onClick={onSend}
            disabled={!item || sending}
            size="sm"
            variant="outline"
            className="absolute left-1/2 top-[74%] -translate-x-1/2 bg-background"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bluetooth className="h-3.5 w-3.5" />}
            Send Command
          </Button>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border bg-background px-2 py-1 text-[11px] text-muted-foreground">
            Bluetooth byte: <span className="font-mono font-semibold text-foreground">{commandByte}</span>
            {commandByte !== "S" && <span> then <span className="font-mono font-semibold text-foreground">S</span> after 2s</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

function RealtimePanel({
  item,
  total,
  activeIndex,
  isRunning,
  secondsRemaining,
  onStart,
  onStop,
}: {
  item: PredictionWindow | null;
  total: number;
  activeIndex: number;
  isRunning: boolean;
  secondsRemaining: number;
  onStart: () => void;
  onStop: () => void;
}) {
  const windowDuration = item?.duration ?? 6;
  const progress = isRunning && windowDuration > 0
    ? ((windowDuration - secondsRemaining) / windowDuration) * 100
    : 0;
  const commandByte = item ? commandByteForLabel(item.predicted_name) : "S";

  return (
    <div className="rounded-md border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide">Realtime Replay</p>
          <p className="text-[11px] text-muted-foreground">Auto-steps every 6s and sends a 2s rover pulse.</p>
        </div>
        {isRunning ? (
          <Button onClick={onStop} size="sm" variant="destructive">
            <Square className="h-3.5 w-3.5" />
            Stop
          </Button>
        ) : (
          <Button onClick={onStart} size="sm" disabled={!total}>
            <Play className="h-3.5 w-3.5" />
            Start
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-md border bg-background p-2">
          <p className="text-[10px] text-muted-foreground uppercase">Window</p>
          <p className="font-mono font-semibold">{total ? activeIndex + 1 : 0}/{total}</p>
        </div>
        <div className="rounded-md border bg-background p-2">
          <p className="text-[10px] text-muted-foreground uppercase">Next Step</p>
          <p className="font-mono font-semibold">{isRunning ? `${secondsRemaining.toFixed(0)}s` : "--"}</p>
        </div>
        <div className="rounded-md border bg-background p-2">
          <p className="text-[10px] text-muted-foreground uppercase">BT Byte</p>
          <p className="font-mono font-semibold">{commandByte}</p>
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-foreground transition-all" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
      </div>

    </div>
  );
}

function CommandLogPanel({ commandLog }: { commandLog: CommandLogEntry[] }) {
  return (
    <div className="rounded-md border bg-card p-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide">Bluetooth Command Log</p>
      <div className="max-h-36 space-y-1 overflow-auto rounded-md border bg-background p-2">
        {commandLog.length ? commandLog.slice(0, 8).map((entry) => (
          <div key={entry.id} className="text-[11px] text-muted-foreground">
            <span className="font-mono text-foreground">{entry.timestamp}</span>
            {" "}W{entry.windowNumber}: sent byte{" "}
            <span className="font-mono font-semibold text-foreground">{entry.byte}</span>
            {" "}({entry.predicted}), then{" "}
            <span className="font-mono font-semibold text-foreground">S</span>
            {" "}after {entry.duration.toFixed(1)}s
          </div>
        )) : (
          <p className="text-[11px] text-muted-foreground">No commands sent yet.</p>
        )}
      </div>
    </div>
  );
}

function StatsPanel({ stats }: { stats: Stats }) {
  return (
    <Panel title="Session Stats" className="min-h-[330px]">
      <div className="space-y-4">
        <div>
          <p className="text-[11px] text-muted-foreground">Percentage</p>
          <p className={`text-2xl font-bold ${stats.overallAccuracy >= 70 ? "text-emerald-700" : "text-red-700"}`}>
            {stats.overallAccuracy.toFixed(1)}%
          </p>
          <p className="text-xs font-semibold mt-1">Overall Accuracy</p>
          <div className="h-2 rounded-full bg-muted mt-2 overflow-hidden">
            <div className={`h-full ${stats.overallAccuracy >= 70 ? "bg-emerald-700 dark:bg-emerald-400" : "bg-red-700 dark:bg-red-400"}`} style={{ width: `${stats.overallAccuracy}%` }} />
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">Items</span><span className="font-semibold">{stats.scored}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Correct</span><span className="font-semibold text-emerald-700">{stats.correct}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Wrong</span><span className="font-semibold text-red-700">{stats.wrong}</span></div>
        </div>

        <div className="border-t pt-3 space-y-2 text-xs">
          <p className="font-semibold">Predicted Classes:</p>
          <div className="flex justify-between"><span className="text-muted-foreground">Left</span><span className="font-semibold text-blue-700 dark:text-blue-400">{stats.counts.left}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Right</span><span className="font-semibold text-orange-700 dark:text-orange-400">{stats.counts.right}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Rest</span><span className="font-semibold text-muted-foreground">{stats.counts.rest}</span></div>
        </div>
      </div>
    </Panel>
  );
}

function SegmentGraph({ segment }: { segment: PredictionSegment }) {
  const channels = segment.graph_channels.slice(0, 3);
  const values = channels.flat();
  const min = values.length ? Math.min(...values) : -1;
  const max = values.length ? Math.max(...values) : 1;
  const span = Math.max(1e-9, max - min);
  const colors = ["var(--chart-1)", "var(--chart-2)", "var(--muted-foreground)"];

  function points(channel: number[]): string {
    return channel
      .map((value, index) => {
        const x = channel.length <= 1 ? 0 : (index / (channel.length - 1)) * 100;
        const y = 100 - ((value - min) / span) * 100;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }

  return (
    <div className="rounded-md border bg-card p-2">
      <p className="mb-2 truncate text-[11px] text-muted-foreground">
        {segment.start_time.toFixed(2)}s - {segment.end_time.toFixed(2)}s | Exp: {segment.expected_name.toUpperCase()} | Pred: {segment.predicted_name.toUpperCase()}
      </p>
      <div className="rounded-md border bg-background p-1">
        {channels.length ? (
          <svg viewBox="0 0 100 100" className="h-24 w-full" preserveAspectRatio="none">
            <line x1="0" y1="33" x2="100" y2="33" stroke="var(--border)" strokeWidth="0.5" />
            <line x1="0" y1="66" x2="100" y2="66" stroke="var(--border)" strokeWidth="0.5" />
            <line x1="33" y1="0" x2="33" y2="100" stroke="var(--border)" strokeWidth="0.5" />
            <line x1="66" y1="0" x2="66" y2="100" stroke="var(--border)" strokeWidth="0.5" />
            {channels.map((channel, index) => (
              <polyline key={index} points={points(channel)} fill="none" stroke={colors[index]} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
        ) : (
          <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">No graph data</div>
        )}
      </div>
    </div>
  );
}

function BottomGraphs({ item, activeIndex, total, onPrev, onNext }: {
  item: PredictionWindow | null;
  activeIndex: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const segments = (item?.segments ?? []).filter((segment) => segment.is_valid && normalizeLabel(segment.predicted_name) !== "unknown");

  return (
    <section className="border-t bg-card px-4 py-3">
      <div className="mx-auto max-w-[1300px]">
        <div className="relative mb-3 text-center">
          <Button variant="default" size="icon-sm" className="absolute left-0 top-0" onClick={onPrev} disabled={activeIndex <= 0} aria-label="Previous window">
            <ChevronLeft />
          </Button>
          <p className="text-xs font-semibold">EEG signal graph of the current window</p>
          <p className="text-[11px] text-muted-foreground">Window {total ? activeIndex + 1 : 0} / {total}</p>
          <Button variant="default" size="icon-sm" className="absolute right-0 top-0" onClick={onNext} disabled={activeIndex >= total - 1} aria-label="Next window">
            <ChevronRight />
          </Button>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          {segments.length ? segments.map((segment) => <SegmentGraph key={segment.segment_number} segment={segment} />) : (
            <div className="md:col-span-3 rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
              No valid segment graph data.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function InferencePage() {
  const [recordings, setRecordings] = useState<RecordingsIndex | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [commandLog, setCommandLog] = useState<CommandLogEntry[]>([]);
  const [realtimeRunning, setRealtimeRunning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(6);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [port, setPort] = useState("");
  const stepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const sentWindowRef = useRef<number | null>(null);

  useEffect(() => {
    fetch("/api/recordings")
      .then((res) => res.json())
      .then(setRecordings)
      .catch(() => setError("Failed to load recordings list"));
  }, []);

  const windows = useMemo(() => prediction?.windows ?? [], [prediction]);
  const activeWindow = windows.length ? windows[Math.min(activeIndex, windows.length - 1)] : null;
  const stats = useMemo(() => computeStats(windows), [windows]);

  const loadRecording = useCallback((path: string) => {
    setRealtimeRunning(false);
    setSelectedPath(path);
    setPrediction(null);
    setActiveIndex(0);
    setError(null);
    setSendStatus(null);
    setCommandLog([]);
  }, []);

  const clearRealtimeTimers = useCallback(() => {
    if (stepTimerRef.current) {
      clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  async function runPrediction() {
    if (!selectedPath) {
      setError("Select a recording first.");
      return;
    }

    setLoading(true);
    setError(null);
    setSendStatus(null);

    const payload: Record<string, unknown> = {
      path: selectedPath,
      window: 6,
      segment: 2,
      commandDuration: 2,
    };
    if (start.trim()) payload.start = Number(start);
    if (end.trim()) payload.end = Number(end);

    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || "Prediction failed");
        return;
      }
      setPrediction(json as PredictionResponse);
      setActiveIndex(0);
      setRealtimeRunning(false);
      setCommandLog([]);
    } catch {
      setError("Could not reach prediction API.");
    } finally {
      setLoading(false);
    }
  }

  const sendWindowCommand = useCallback(async (window: PredictionWindow, mode: "manual" | "realtime") => {
    setSending(true);
    setError(null);
    setSendStatus(null);

    try {
      const res = await fetch("/api/rover/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: window.predicted_name,
          duration: window.command_duration_sec,
          port: port.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || "Bluetooth send failed");
        return;
      }
      const byte = String(json.byte ?? commandByteForLabel(window.predicted_name));
      const duration = Number(json.duration_sec ?? window.command_duration_sec);
      setSendStatus(`Sent byte ${byte} (${COMMAND_LABELS[byte] ?? byte}) for ${duration.toFixed(1)}s, then S`);
      setCommandLog((prev) => [
        {
          id: Date.now(),
          mode,
          windowNumber: window.window_number,
          predicted: window.predicted_name,
          byte,
          duration,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
    } catch {
      setError("Could not reach rover API.");
    } finally {
      setSending(false);
    }
  }, [port]);

  async function sendCommand() {
    if (!activeWindow) return;
    await sendWindowCommand(activeWindow, "manual");
  }

  function stopRealtime() {
    setRealtimeRunning(false);
    clearRealtimeTimers();
    sentWindowRef.current = null;
  }

  function startRealtime() {
    if (!windows.length) return;
    setActiveIndex(0);
    setCommandLog([]);
    setSendStatus(null);
    sentWindowRef.current = null;
    setRealtimeRunning(true);
  }

  useEffect(() => {
    if (!realtimeRunning || !activeWindow) return;

    clearRealtimeTimers();

    const duration = Math.max(1, activeWindow.duration || 6);
    setSecondsRemaining(duration);

    if (sentWindowRef.current !== activeWindow.window_number) {
      sentWindowRef.current = activeWindow.window_number;
      void sendWindowCommand(activeWindow, "realtime");
    }

    countdownRef.current = setInterval(() => {
      setSecondsRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);

    stepTimerRef.current = setTimeout(() => {
      setActiveIndex((index) => {
        if (index >= windows.length - 1) {
          setRealtimeRunning(false);
          sentWindowRef.current = null;
          return index;
        }
        return index + 1;
      });
    }, duration * 1000);

    return clearRealtimeTimers;
  }, [activeWindow, clearRealtimeTimers, realtimeRunning, sendWindowCommand, windows.length]);

  useEffect(() => clearRealtimeTimers, [clearRealtimeTimers]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <AppTopBar
        title={`EEG ROBOT INTERFACE (MI: ${stats.miAccuracy.toFixed(1)}% ${stats.miCorrect}/${stats.miTotal} | Rest: ${stats.restAccuracy.toFixed(1)}% ${stats.restCorrect}/${stats.restTotal} | Overall: ${stats.overallAccuracy.toFixed(1)}% ${stats.correct}/${stats.scored})`}
        backHref="/"
        maxWidthClassName="max-w-[1300px]"
      />

      <main className="mx-auto max-w-[1300px] w-full flex-1 px-4 py-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-[230px_1fr_210px]">
          <CurrentWindowPanel item={activeWindow} />
          <RobotPanel item={activeWindow} sending={sending} onSend={sendCommand} />
          <StatsPanel stats={stats} />
        </div>

        <div className="grid gap-3 lg:grid-cols-[300px_1fr_1fr]">
          <RecordingSelector
            recordings={recordings}
            selectedPath={selectedPath}
            onSelect={loadRecording}
            loading={loading}
          />

          <div className="rounded-md border bg-card p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide">Inference Setup</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1.2fr_auto]">
              <Input value={start} onChange={(event) => setStart(event.target.value)} placeholder="Start abs s" className="h-8 text-xs" inputMode="decimal" />
              <Input value={end} onChange={(event) => setEnd(event.target.value)} placeholder="End abs s" className="h-8 text-xs" inputMode="decimal" />
              <Input value={port} onChange={(event) => setPort(event.target.value)} placeholder="COM port (default COM11)" className="h-8 text-xs" />
              <Button onClick={runPrediction} disabled={loading || !selectedPath} size="sm" className="h-8">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Load Windows
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Each displayed window is 6s, split into three 2s classifier segments. The rover receives one 2s pulse for the selected window.
            </p>
            {sendStatus && (
              <div className="rounded-md border border-emerald-600/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <Send className="h-3.5 w-3.5" />
                {sendStatus}
              </div>
            )}
            {error && (
              <Alert variant="destructive" className="py-2">
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <RealtimePanel
            item={activeWindow}
            total={windows.length}
            activeIndex={activeIndex}
            isRunning={realtimeRunning}
            secondsRemaining={secondsRemaining}
            onStart={startRealtime}
            onStop={stopRealtime}
          />
        </div>

        <CommandLogPanel commandLog={commandLog} />
      </main>

      <BottomGraphs
        item={activeWindow}
        activeIndex={activeIndex}
        total={windows.length}
        onPrev={() => setActiveIndex((index) => Math.max(0, index - 1))}
        onNext={() => setActiveIndex((index) => Math.min(windows.length - 1, index + 1))}
      />
    </div>
  );
}
