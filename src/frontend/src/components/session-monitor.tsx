"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { SessionStatus } from "@/lib/types";

interface SessionMonitorProps {
  status: SessionStatus;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function stateLabel(state: SessionStatus["state"]): string {
  const labels: Record<SessionStatus["state"], string> = {
    idle: "Ready",
    practice: "Practice",
    running: "Recording",
    break: "Break",
    completed: "Completed",
    aborted: "Aborted",
  };
  return labels[state];
}

function stateBadgeVariant(
  state: SessionStatus["state"]
): "default" | "secondary" | "destructive" | "outline" {
  const variants: Record<
    SessionStatus["state"],
    "default" | "secondary" | "destructive" | "outline"
  > = {
    idle: "secondary",
    practice: "outline",
    running: "default",
    break: "secondary",
    completed: "secondary",
    aborted: "destructive",
  };
  return variants[state];
}

const PHASE_LABELS: Record<SessionStatus["phase"], string> = {
  baseline: "Baseline  +",
  cue: "Cue  \u2190 / \u2192",
  mi: "Motor Imagery",
  rest: "Rest",
  break: "Break",
  none: "\u2014",
};

const PHASE_COLORS: Record<SessionStatus["phase"], string> = {
  baseline: "bg-[#FFE0E9]/20 border-[#FFE0E9]/40",
  cue: "bg-[#B9375E]/10 border-[#B9375E]/30",
  mi: "bg-[#CEDDBB]/20 border-[#CEDDBB]/40",
  rest: "bg-[#BE9A60]/10 border-[#BE9A60]/30",
  break: "bg-muted/50 border-muted",
  none: "bg-muted/50 border-transparent",
};

export function SessionMonitor({ status }: SessionMonitorProps) {
  const isActive = status.state === "running" || status.state === "practice";
  const sessionDone =
    status.state === "completed" || status.state === "aborted";

  // Live elapsed timer — ticks every second locally between polls
  const [liveElapsed, setLiveElapsed] = useState(status.elapsed_seconds);

  useEffect(() => {
    setLiveElapsed(status.elapsed_seconds);
  }, [status.elapsed_seconds]);

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setLiveElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  const trialProgress =
    status.total_trials > 0
      ? status.state === "completed"
        ? 100
        : (status.current_trial / status.total_trials) * 100
      : 0;

  const blockProgress =
    status.total_blocks > 0
      ? status.state === "completed"
        ? 100
        : ((status.current_block - 1) / status.total_blocks) * 100 +
          trialProgress / status.total_blocks
      : 0;

  return (
    <Card className="py-4 gap-0">
      <CardContent className="space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isActive && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
            )}
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {isActive ? "Live" : "Session Log"}
            </span>
          </div>
          <Badge variant={stateBadgeVariant(status.state)} className="text-[11px]">
            {stateLabel(status.state)}
          </Badge>
        </div>

        {/* Idle hint */}
        {status.state === "idle" && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            Configure parameters and start when ready.
          </p>
        )}

        {/* Live phase indicator */}
        {isActive && (
          <div className={`text-center py-3 rounded-md border ${PHASE_COLORS[status.phase]} transition-colors duration-300`}>
            <p className="text-[10px] text-muted-foreground mb-1">Current Phase</p>
            <p className="text-lg font-semibold tracking-tight leading-none">
              {PHASE_LABELS[status.phase]}
            </p>
          </div>
        )}

        {/* Live elapsed timer (prominent during recording) */}
        {isActive && (
          <div className="text-center">
            <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
              {formatTime(liveElapsed)}
            </span>
          </div>
        )}

        {/* Progress */}
        {(isActive || sessionDone) && (
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Trial</span>
                <span className="font-mono">
                  {status.current_trial}/{status.total_trials}
                </span>
              </div>
              <Progress value={trialProgress} className="h-1.5" />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Block</span>
                <span className="font-mono">
                  {status.current_block}/{status.total_blocks}
                </span>
              </div>
              <Progress value={blockProgress} className="h-1.5" />
            </div>
          </div>
        )}

        {/* Stats */}
        {(isActive || sessionDone) && (
          <div className="space-y-1 pt-2 border-t text-xs">
            {sessionDone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-mono">
                  {formatTime(status.elapsed_seconds)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bad Trials</span>
              <span className="font-mono">
                {status.bad_trials > 0 ? (
                  <span className="text-destructive">{status.bad_trials}</span>
                ) : (
                  "0"
                )}
              </span>
            </div>
            {status.output_file && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Output</span>
                <span
                  className="font-mono text-[10px] text-muted-foreground truncate max-w-[140px]"
                  title={status.output_file}
                >
                  {status.output_file}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
