"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { AppTopBar } from "@/components/app-top-bar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RecordingSelector } from "@/components/viewer/recording-selector";
import { RecordingInfo } from "@/components/viewer/recording-info";
import { MarkerLegend } from "@/components/viewer/marker-legend";
import { ChannelToggles } from "@/components/viewer/channel-toggles";
import { MarkerRail } from "@/components/viewer/marker-rail";
import { ChannelChart } from "@/components/viewer/channel-chart";
import { TimeControls } from "@/components/viewer/time-controls";
import {
  MARKER_CONFIG,
  ZOOM_LEVELS,
  DEFAULT_ZOOM_SECONDS,
  DEFAULT_AMPLITUDE_GAIN,
} from "@/lib/viewer-constants";
import type { RecordingsIndex, XDFData } from "@/lib/types";

export default function ViewerPage() {
  const [recordings, setRecordings] = useState<RecordingsIndex | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [data, setData] = useState<XDFData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);

  // Visualization state
  const [enabledChannels, setEnabledChannels] = useState<Set<string>>(new Set());
  const [enabledMarkers, setEnabledMarkers] = useState<Set<string>>(new Set());
  const [viewStart, setViewStart] = useState(0);
  const [zoomSeconds, setZoomSeconds] = useState(DEFAULT_ZOOM_SECONDS);
  const [amplitudeGain, setAmplitudeGain] = useState(DEFAULT_AMPLITUDE_GAIN);

  // Fetch recordings list on mount
  useEffect(() => {
    fetch("/api/recordings")
      .then((res) => res.json())
      .then(setRecordings)
      .catch(() => setError("Failed to load recordings list"));
  }, []);

  // Load selected recording
  const loadRecording = useCallback(async (path: string) => {
    setSelectedPath(path);
    setUploadedFilename(null);
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch("/api/recordings/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const json = await res.json();

      if (!res.ok || json.error) {
        setError(json.error || "Failed to load recording");
        setLoading(false);
        return;
      }

      const xdf = json as XDFData;
      setData(xdf);

      // Initialize visualization state
      setEnabledChannels(new Set(xdf.channels));
      const markerTypes = new Set(xdf.markers.map((m) => m.label));
      setEnabledMarkers(markerTypes);
      setViewStart(0);
      setZoomSeconds(DEFAULT_ZOOM_SECONDS);
      setAmplitudeGain(DEFAULT_AMPLITUDE_GAIN);
    } catch {
      setError("Failed to connect to server");
    }
    setLoading(false);
  }, []);

  // Upload a file
  const uploadRecording = useCallback(async (file: File) => {
    setSelectedPath(null);
    setUploadedFilename(file.name);
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/recordings/upload", {
        method: "POST",
        body: form,
      });
      const json = await res.json();

      if (!res.ok || json.error) {
        setError(json.error || "Failed to load uploaded file");
        setLoading(false);
        return;
      }

      const xdf = json as XDFData;
      setData(xdf);
      setEnabledChannels(new Set(xdf.channels));
      setEnabledMarkers(new Set(xdf.markers.map((m) => m.label)));
      setViewStart(0);
      setZoomSeconds(DEFAULT_ZOOM_SECONDS);
      setAmplitudeGain(DEFAULT_AMPLITUDE_GAIN);
    } catch {
      setError("Failed to upload file");
    }
    setLoading(false);
  }, []);

  // Computed view end
  const viewEnd = useMemo(() => {
    if (!data) return 0;
    return zoomSeconds === Infinity ? data.duration : Math.min(viewStart + zoomSeconds, data.duration);
  }, [data, viewStart, zoomSeconds]);

  // Filter markers by enabled types
  const filteredMarkers = useMemo(() => {
    if (!data) return [];
    return data.markers.filter((m) => enabledMarkers.has(m.label));
  }, [data, enabledMarkers]);

  // Enabled channels list (preserving order)
  const enabledChannelsList = useMemo(() => {
    if (!data) return [];
    return data.channels.filter((ch) => enabledChannels.has(ch));
  }, [data, enabledChannels]);

  // Filename from path
  const filename = uploadedFilename ?? selectedPath?.split("/").pop() ?? "";

  // Toggle handlers
  const toggleChannel = useCallback((ch: string) => {
    setEnabledChannels((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch);
      else next.add(ch);
      return next;
    });
  }, []);

  const toggleAllChannels = useCallback(() => {
    if (!data) return;
    setEnabledChannels((prev) => {
      const allEnabled = data.channels.every((ch) => prev.has(ch));
      return allEnabled ? new Set<string>() : new Set(data.channels);
    });
  }, [data]);

  const toggleMarker = useCallback((label: string) => {
    setEnabledMarkers((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const toggleMarkerGroup = useCallback(
    (group: string) => {
      if (!data) return;
      const presentTypes = new Set(data.markers.map((m) => m.label));
      const groupTypes = group === "Other"
        ? [...presentTypes].filter((t) => !Object.keys(MARKER_CONFIG).includes(t))
        : Object.entries(MARKER_CONFIG)
            .filter(([key, cfg]) => cfg.group === group && presentTypes.has(key))
            .map(([key]) => key);

      setEnabledMarkers((prev) => {
        const allEnabled = groupTypes.every((t) => prev.has(t));
        const next = new Set(prev);
        for (const t of groupTypes) {
          if (allEnabled) next.delete(t);
          else next.add(t);
        }
        return next;
      });
    },
    [data]
  );

  // Clamp viewStart when zoom changes
  const handleZoomChange = useCallback(
    (seconds: number) => {
      setZoomSeconds(seconds);
      if (data && seconds !== Infinity) {
        setViewStart((prev) => Math.min(prev, Math.max(0, data.duration - seconds)));
      } else {
        setViewStart(0);
      }
    },
    [data]
  );

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!data) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      const effectiveZoom = zoomSeconds === Infinity ? data.duration : zoomSeconds;
      const maxStart = Math.max(0, data.duration - effectiveZoom);
      const step = effectiveZoom * 0.25;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setViewStart((v) => Math.max(0, v - step));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setViewStart((v) => Math.min(maxStart, v + step));
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        const idx = ZOOM_LEVELS.findIndex((z) => z.seconds === zoomSeconds);
        if (idx > 0) handleZoomChange(ZOOM_LEVELS[idx - 1].seconds);
      } else if (e.key === "-") {
        e.preventDefault();
        const idx = ZOOM_LEVELS.findIndex((z) => z.seconds === zoomSeconds);
        if (idx < ZOOM_LEVELS.length - 1) handleZoomChange(ZOOM_LEVELS[idx + 1].seconds);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, zoomSeconds, handleZoomChange]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppTopBar title="HELIN" subtitle="Signal Viewer" backHref="/" maxWidthClassName="max-w-[1600px]">
        {data && (
          <span className="text-[11px] font-mono text-muted-foreground">
            {data.channels.length}ch @ {data.srate}Hz
          </span>
        )}
      </AppTopBar>

      <main className="flex-1 px-4 py-4 max-w-[1600px] mx-auto w-full">
        <div className="grid grid-cols-[1fr_240px] gap-4 items-start">
          {/* Left: Charts area */}
          <div className="space-y-2">
            {loading && (
              <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-sm">Loading recording...</span>
              </div>
            )}

            {error && (
              <Alert variant="destructive" className="py-2">
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}

            {!data && !loading && !error && (
              <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                <p className="text-sm">Select a recording to begin.</p>
              </div>
            )}

            {data && !loading && (
              <>
                {/* Marker rail */}
                <MarkerRail
                  markers={data.markers}
                  enabledMarkers={enabledMarkers}
                  viewStart={viewStart}
                  viewEnd={viewEnd}
                />

                {/* Stacked channel charts */}
                <div className="border rounded-md overflow-hidden bg-card">
                  {enabledChannelsList.length === 0 ? (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                      No channels selected
                    </div>
                  ) : (
                    enabledChannelsList.map((ch, i) => (
                      <div
                        key={ch}
                        className={
                          i < enabledChannelsList.length - 1
                            ? "border-b border-border/30"
                            : ""
                        }
                      >
                        <ChannelChart
                          channelName={ch}
                          timeData={data.eeg.time}
                          channelData={data.eeg[ch]}
                          markers={filteredMarkers}
                          viewStart={viewStart}
                          viewEnd={viewEnd}
                          amplitudeGain={amplitudeGain}
                          isLast={i === enabledChannelsList.length - 1}
                        />
                      </div>
                    ))
                  )}
                </div>

                {/* Time controls */}
                <TimeControls
                  viewStart={viewStart}
                  zoomSeconds={zoomSeconds}
                  duration={data.duration}
                  amplitudeGain={amplitudeGain}
                  onViewStartChange={setViewStart}
                  onZoomChange={handleZoomChange}
                  onAmplitudeChange={setAmplitudeGain}
                />
              </>
            )}
          </div>

          {/* Right: Sidebar */}
          <div className="sticky top-4 space-y-2">
            <RecordingSelector
              recordings={recordings}
              selectedPath={selectedPath}
              onSelect={loadRecording}
              onUpload={uploadRecording}
              loading={loading}
            />
            {data && <RecordingInfo data={data} filename={filename} />}
            {data && (
              <MarkerLegend
                markers={data.markers}
                enabledMarkers={enabledMarkers}
                onToggle={toggleMarker}
                onToggleGroup={toggleMarkerGroup}
              />
            )}
            {data && (
              <ChannelToggles
                channels={data.channels}
                enabledChannels={enabledChannels}
                onToggle={toggleChannel}
                onToggleAll={toggleAllChannels}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
