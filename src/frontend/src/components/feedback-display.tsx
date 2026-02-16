"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { FeedbackData } from "@/lib/types";

interface FeedbackDisplayProps {
  isRunning: boolean;
}

const EMPTY_FEEDBACK: FeedbackData = {
  timestamp: 0,
  connected: false,
  stream_name: null,
  channels: {
    C3: { mu_power: 0, beta_power: 0 },
    C4: { mu_power: 0, beta_power: 0 },
  },
  laterality_index: 0,
  mu_suppression: 0,
  error: "Feedback not running",
};

function powerToIntensity(power: number, maxPower: number): number {
  if (maxPower <= 0) return 0;
  return Math.min(1, Math.max(0, power / maxPower));
}

function intensityToColor(intensity: number): string {
  const s = Math.round(intensity * 35);
  const l = Math.round(80 - intensity * 15);
  return `hsl(90, ${s}%, ${l}%)`;
}

export function FeedbackDisplay({ isRunning }: FeedbackDisplayProps) {
  const [feedback, setFeedback] = useState<FeedbackData>(EMPTY_FEEDBACK);
  const [maxMu, setMaxMu] = useState(1);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const pollFeedback = useCallback(async () => {
    try {
      const res = await fetch("/api/feedback", { cache: "no-store" });
      if (res.ok) {
        const data: FeedbackData = await res.json();
        setFeedback(data);
        const currentMax = Math.max(
          data.channels.C3.mu_power,
          data.channels.C4.mu_power
        );
        if (currentMax > 0) {
          setMaxMu((prev) => Math.max(prev, currentMax));
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (isRunning) {
      pollingRef.current = setInterval(pollFeedback, 500);
      pollFeedback();
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isRunning, pollFeedback]);

  useEffect(() => {
    if (!isRunning) {
      setMaxMu(1);
      setFeedback(EMPTY_FEEDBACK);
    }
  }, [isRunning]);

  const c3Intensity = powerToIntensity(feedback.channels.C3.mu_power, maxMu);
  const c4Intensity = powerToIntensity(feedback.channels.C4.mu_power, maxMu);
  const c3Color = intensityToColor(c3Intensity);
  const c4Color = intensityToColor(c4Intensity);

  return (
    <Card className="py-3 gap-2">
      <CardContent className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Neurofeedback
          </span>
          <Badge
            variant={feedback.connected ? "default" : "secondary"}
            className="text-[11px]"
          >
            {feedback.connected ? "Connected" : "Disconnected"}
          </Badge>
        </div>

        {/* Brain Map SVG */}
        <div className="flex justify-center">
          <svg viewBox="0 0 200 220" className="w-40 h-44">
            {/* Head outline */}
            <ellipse
              cx="100" cy="120" rx="80" ry="90"
              fill="none" stroke="currentColor"
              className="text-border" strokeWidth="2"
            />
            {/* Nose indicator */}
            <path
              d="M 100 28 L 93 42 L 107 42 Z"
              fill="none" stroke="currentColor"
              className="text-border" strokeWidth="1.5"
            />
            {/* C3 region (left hemisphere) */}
            <circle
              cx="55" cy="110" r="22"
              fill={feedback.connected ? c3Color : "hsl(0, 0%, 85%)"}
              stroke="currentColor" className="text-border"
              strokeWidth="1"
              style={{ transition: "fill 300ms ease" }}
            />
            <text
              x="55" y="114" textAnchor="middle"
              className="text-muted-foreground fill-current"
              fontSize="11" fontFamily="var(--font-geist-mono)"
            >
              C3
            </text>
            {/* C4 region (right hemisphere) */}
            <circle
              cx="145" cy="110" r="22"
              fill={feedback.connected ? c4Color : "hsl(0, 0%, 85%)"}
              stroke="currentColor" className="text-border"
              strokeWidth="1"
              style={{ transition: "fill 300ms ease" }}
            />
            <text
              x="145" y="114" textAnchor="middle"
              className="text-muted-foreground fill-current"
              fontSize="11" fontFamily="var(--font-geist-mono)"
            >
              C4
            </text>
            {/* Cz reference point */}
            <circle cx="100" cy="110" r="3" className="fill-muted-foreground/30" />
            <text
              x="100" y="100" textAnchor="middle"
              className="text-muted-foreground/50 fill-current"
              fontSize="9" fontFamily="var(--font-geist-mono)"
            >
              Cz
            </text>
          </svg>
        </div>

        {/* Error message */}
        {!feedback.connected && feedback.error && (
          <p className="text-xs text-muted-foreground text-center">
            {feedback.error}
          </p>
        )}

        {/* Dual mu power bars */}
        {feedback.connected && (
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground text-center">
              Mu Power (8–13 Hz)
            </p>
            <div className="grid grid-cols-2 gap-2">
              {/* C3 bar */}
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground">C3</span>
                  <span className="font-mono">
                    {feedback.channels.C3.mu_power.toFixed(2)}
                  </span>
                </div>
                <div className="h-1.5 bg-primary/20 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${c3Intensity * 100}%`,
                      backgroundColor: c3Color,
                    }}
                  />
                </div>
              </div>
              {/* C4 bar */}
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground">C4</span>
                  <span className="font-mono">
                    {feedback.channels.C4.mu_power.toFixed(2)}
                  </span>
                </div>
                <div className="h-1.5 bg-primary/20 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${c4Intensity * 100}%`,
                      backgroundColor: c4Color,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Suppression indicator */}
            <div className="text-center pt-1 border-t">
              <p className="text-[10px] text-muted-foreground">
                Mu Suppression (ERD)
              </p>
              <span className="font-mono text-sm font-semibold">
                {(feedback.mu_suppression * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
