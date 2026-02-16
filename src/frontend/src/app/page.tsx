"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "@/components/header";
import { ConfigForm } from "@/components/config-form";
import { ProtocolReference } from "@/components/protocol-reference";
import { SessionMonitor } from "@/components/session-monitor";
import { FeedbackDisplay } from "@/components/feedback-display";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_CONFIG,
  type ExperimentConfig,
  type SessionStatus,
} from "@/lib/types";

const IDLE_STATUS: SessionStatus = {
  state: "idle",
  phase: "none",
  current_trial: 0,
  total_trials: 0,
  current_block: 0,
  total_blocks: 0,
  bad_trials: 0,
  elapsed_seconds: 0,
  output_file: "",
};

export default function Home() {
  const [config, setConfig] = useState<ExperimentConfig>(DEFAULT_CONFIG);

  // Load saved defaults after mount to avoid SSR hydration mismatch
  useEffect(() => {
    try {
      const raw = localStorage.getItem("helin-defaults");
      if (raw) {
        const saved = JSON.parse(raw);
        setConfig((prev) => ({
          ...prev,
          colors: saved.colors ?? prev.colors,
          timing: saved.timing ?? prev.timing,
          blocks: saved.blocks ?? prev.blocks,
        }));
      }
    } catch { /* ignore */ }
  }, []);
  const [status, setStatus] = useState<SessionStatus>(IDLE_STATUS);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (res.ok) {
        const data: SessionStatus = await res.json();
        setStatus(data);

        if (data.state === "completed" || data.state === "aborted") {
          setIsRunning(false);
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
      }
    } catch {
      // Ignore fetch errors during polling
    }
  }, []);

  useEffect(() => {
    if (isRunning && !pollingRef.current) {
      pollingRef.current = setInterval(pollStatus, 500);
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isRunning, pollStatus]);

  // When tab becomes visible again, poll immediately (browsers throttle background tabs)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && isRunning) {
        pollStatus();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isRunning, pollStatus]);

  async function handleStart() {
    if (!config.participant_id.trim()) {
      setError("Participant ID is required");
      return;
    }
    if (config.blocks.trials_per_block % 2 !== 0) {
      setError("Trials per block must be even (balanced left/right)");
      return;
    }
    if (config.timing.rest_min >= config.timing.rest_max) {
      setError("Rest Min must be less than Rest Max");
      return;
    }

    setError(null);
    setStatus(IDLE_STATUS);
    setStarting(true);

    try {
      const res = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to start session");
        setStarting(false);
        return;
      }

      setIsRunning(true);
    } catch {
      setError("Failed to connect to server");
    }
    setStarting(false);
  }

  async function handleStop() {
    try {
      await fetch("/api/start", { method: "DELETE" });
      setIsRunning(false);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      await pollStatus();
    } catch {
      setError("Failed to stop session");
    }
  }

  function handleReset() {
    setStatus(IDLE_STATUS);
    setIsRunning(false);
    setError(null);
  }

  const sessionDone =
    status.state === "completed" || status.state === "aborted";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header frequency={config.device_frequency} isRunning={isRunning} />

      <main className="flex-1 px-4 py-6 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-[1fr_300px] gap-4 items-start">
          {/* Left: config + actions */}
          <div className="space-y-2">
            <ConfigForm
              config={config}
              onChange={setConfig}
              disabled={isRunning}
            />

            <ProtocolReference config={config} />
          </div>

          {/* Right: session monitor + notes + actions */}
          <div className="sticky top-6 space-y-2">
            <SessionMonitor status={status} />
            <FeedbackDisplay isRunning={isRunning} />
            <Card className="py-3 gap-2">
              <CardContent>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Session Notes</p>
                <Textarea
                  placeholder="Electrode placement, impedance, participant alertness..."
                  value={config.notes}
                  onChange={(e) => setConfig({ ...config, notes: e.target.value })}
                  disabled={isRunning}
                  className="text-sm min-h-[100px] resize-none"
                  rows={4}
                />
              </CardContent>
            </Card>

            {/* Action buttons */}
            <div className="space-y-2">
              {!isRunning && !sessionDone && (
                <Button
                  onClick={handleStart}
                  disabled={starting}
                  className="w-full"
                >
                  {starting ? "Starting..." : "Start Session"}
                </Button>
              )}
              {isRunning && (
                <Button
                  onClick={handleStop}
                  variant="destructive"
                  className="w-full"
                >
                  Stop Session
                </Button>
              )}
              {sessionDone && (
                <Button
                  onClick={handleReset}
                  variant="outline"
                  className="w-full"
                >
                  New Session
                </Button>
              )}

              {error && (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              )}

              {!isRunning && !sessionDone && !error && (
                <p className="text-xs text-muted-foreground text-center">
                  Make sure LabRecorder is running and recording both streams.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
