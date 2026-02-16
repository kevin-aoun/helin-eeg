"use client";

import { Input } from "@/components/ui/input";
import type { ExperimentConfig } from "@/lib/types";

interface TrialTimelineProps {
  timing: ExperimentConfig["timing"];
  onChange: (key: keyof ExperimentConfig["timing"], value: number) => void;
  disabled: boolean;
}

function parseNum(value: string, fallback: number): number {
  const n = parseFloat(value);
  return isNaN(n) ? fallback : n;
}

export function TrialTimeline({
  timing,
  onChange,
  disabled,
}: TrialTimelineProps) {
  const restAvg = (timing.rest_min + timing.rest_max) / 2;
  const total = timing.baseline + timing.cue + timing.mi + restAvg;

  const bars = [
    {
      key: "baseline",
      label: "Baseline",
      duration: timing.baseline,
      detail: `${timing.baseline}s`,
      gradient: "linear-gradient(135deg, #FFE0E9, #f5c8d5)",
      textClass: "text-[#434343]",
      striped: false,
    },
    {
      key: "cue",
      label: "Cue",
      duration: timing.cue,
      detail: `${timing.cue}s`,
      gradient: "linear-gradient(135deg, #c94570, #B9375E)",
      textClass: "text-white",
      striped: false,
    },
    {
      key: "mi",
      label: "Motor Imagery",
      duration: timing.mi,
      detail: `${timing.mi}s`,
      gradient: "linear-gradient(135deg, #d8e4c8, #CEDDBB)",
      textClass: "text-[#434343]",
      striped: false,
    },
    {
      key: "rest",
      label: "Rest",
      duration: restAvg,
      detail: `${timing.rest_min}\u2013${timing.rest_max}s`,
      gradient: "linear-gradient(135deg, #c9a970, #BE9A60)",
      textClass: "text-white",
      striped: true,
    },
  ];

  const maxTick = Math.ceil(total);

  return (
    <div className="space-y-2">
      {/* Phase bars */}
      <div className="flex h-14 rounded-lg overflow-hidden gap-[2px]">
        {bars.map((b) => {
          const pct = (b.duration / total) * 100;
          const wide = pct > 14;
          return (
            <div
              key={b.key}
              className="flex items-center justify-center transition-all duration-200"
              style={{
                width: `${pct}%`,
                minWidth: 28,
                background: b.striped
                  ? `repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.15) 4px, rgba(255,255,255,0.15) 8px), ${b.gradient}`
                  : b.gradient,
              }}
            >
              {wide ? (
                <span className={`${b.textClass} text-xs font-medium truncate px-2 drop-shadow-sm`}>
                  {b.label}{" "}
                  <span className="opacity-75 font-mono text-[11px]">
                    {b.detail}
                  </span>
                </span>
              ) : (
                <span className={`${b.textClass}/90 text-[10px] font-mono drop-shadow-sm`}>
                  {b.duration.toFixed(1)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Time axis with tick marks */}
      <div className="relative h-5">
        {Array.from({ length: maxTick + 1 }, (_, i) => i).map((t) => {
          const pct = (t / total) * 100;
          if (pct > 102) return null;
          return (
            <div
              key={t}
              className="absolute flex flex-col items-center"
              style={{
                left: `${Math.min(pct, 100)}%`,
                transform: "translateX(-50%)",
              }}
            >
              <div className="w-px h-1.5 bg-muted-foreground/30" />
              <span className="text-[9px] text-muted-foreground font-mono mt-0.5">
                {t}s
              </span>
            </div>
          );
        })}
      </div>

      {/* Duration controls */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
        {[
          {
            key: "baseline" as const,
            label: "Baseline",
            dot: "bg-[#FFE0E9]",
            step: 0.1,
            min: 0.5,
            max: 5.0,
            fallback: 2.0,
          },
          {
            key: "cue" as const,
            label: "Cue",
            dot: "bg-[#B9375E]",
            step: 0.1,
            min: 0.2,
            max: 2.0,
            fallback: 1.0,
          },
          {
            key: "mi" as const,
            label: "MI",
            dot: "bg-[#CEDDBB]",
            step: 0.5,
            min: 2.0,
            max: 8.0,
            fallback: 4.0,
          },
          {
            key: "rest_min" as const,
            label: "Rest min",
            dot: "bg-[#BE9A60]",
            step: 0.1,
            min: 0.5,
            max: 5.0,
            fallback: 2.0,
          },
          {
            key: "rest_max" as const,
            label: "Rest max",
            dot: "bg-[#BE9A60]",
            step: 0.1,
            min: 1.0,
            max: 7.0,
            fallback: 3.0,
          },
        ].map((c) => (
          <div key={c.key} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${c.dot} shrink-0`} />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {c.label}
            </span>
            <Input
              type="number"
              step={c.step}
              min={c.min}
              max={c.max}
              value={timing[c.key]}
              onChange={(e) =>
                onChange(c.key, parseNum(e.target.value, c.fallback))
              }
              disabled={disabled}
              className="w-16 h-7 text-center text-xs"
            />
          </div>
        ))}
        <span className="ml-auto text-xs text-muted-foreground font-mono">
          ~{total.toFixed(1)}s / trial
        </span>
      </div>
    </div>
  );
}
