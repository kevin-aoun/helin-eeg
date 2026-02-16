"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import type { LSLStream } from "@/lib/types";

interface HeaderProps {
  frequency: number;
  isRunning: boolean;
}

export function Header({ frequency, isRunning }: HeaderProps) {
  const [streams, setStreams] = useState<LSLStream[]>([]);
  const [checking, setChecking] = useState(false);

  const checkStreams = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/streams");
      if (res.ok) setStreams(await res.json());
    } catch {
      /* ignore */
    }
    setChecking(false);
  }, []);

  useEffect(() => {
    checkStreams();
    const interval = setInterval(checkStreams, 5000);
    return () => clearInterval(interval);
  }, [checkStreams]);

  const eegStream = streams.find((s) => s.type !== "Markers" && s.srate > 0);
  const hasEEG = !!eegStream;

  return (
    <header className="border-b bg-card">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold tracking-tight">HELIN</h1>
          <span className="text-[11px] text-muted-foreground">MI Collection</span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* LSL device indicator */}
          <div className="flex items-center gap-1.5 text-xs">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                hasEEG
                  ? "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]"
                  : checking
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-muted-foreground/30"
              }`}
            />
            <span className="text-muted-foreground">
              {hasEEG
                ? `${eegStream.name} (${eegStream.channels}ch)`
                : "No device"}
            </span>
          </div>

          <Badge
            variant={isRunning ? "default" : "secondary"}
            className="font-mono text-[11px] px-2 py-0"
          >
            {frequency} Hz
          </Badge>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
