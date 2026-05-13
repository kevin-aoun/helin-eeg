"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { ZOOM_LEVELS } from "@/lib/viewer-constants";

interface TimeControlsProps {
  viewStart: number;
  zoomSeconds: number;
  duration: number;
  amplitudeGain: number;
  onViewStartChange: (value: number) => void;
  onZoomChange: (seconds: number) => void;
  onAmplitudeChange: (gain: number) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}

export function TimeControls({
  viewStart,
  zoomSeconds,
  duration,
  amplitudeGain,
  onViewStartChange,
  onZoomChange,
  onAmplitudeChange,
}: TimeControlsProps) {
  const effectiveZoom = zoomSeconds === Infinity ? duration : zoomSeconds;
  const maxStart = Math.max(0, duration - effectiveZoom);
  const stepSize = effectiveZoom * 0.25;

  return (
    <Card className="py-3 gap-2">
      <CardContent className="space-y-3">
        {/* Time slider */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => onViewStartChange(Math.max(0, viewStart - stepSize))}
            disabled={viewStart <= 0 || zoomSeconds === Infinity}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Slider
            min={0}
            max={maxStart}
            step={0.1}
            value={[viewStart]}
            onValueChange={([v]) => onViewStartChange(v)}
            disabled={zoomSeconds === Infinity}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() =>
              onViewStartChange(Math.min(maxStart, viewStart + stepSize))
            }
            disabled={viewStart >= maxStart || zoomSeconds === Infinity}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Position display */}
        <div className="text-center text-[11px] font-mono text-muted-foreground">
          {formatTime(viewStart)} — {formatTime(Math.min(viewStart + effectiveZoom, duration))}
          <span className="mx-1.5">/</span>
          {formatTime(duration)}
        </div>

        {/* Zoom + Amplitude row */}
        <div className="flex items-center justify-between">
          {/* Zoom levels */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground mr-1">Zoom</span>
            {ZOOM_LEVELS.map((z) => (
              <Toggle
                key={z.label}
                size="sm"
                pressed={zoomSeconds === z.seconds}
                onPressedChange={() => onZoomChange(z.seconds)}
                className="h-6 px-2 text-[11px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {z.label}
              </Toggle>
            ))}
          </div>

          {/* Amplitude gain */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">Gain</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onAmplitudeChange(Math.max(0.1, amplitudeGain / 1.5))}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="text-[11px] font-mono w-8 text-center">
              {amplitudeGain.toFixed(1)}x
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onAmplitudeChange(Math.min(20, amplitudeGain * 1.5))}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
