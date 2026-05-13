"use client";

import { useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MARKER_CONFIG } from "@/lib/viewer-constants";
import type { XDFMarker } from "@/lib/types";

interface MarkerRailProps {
  markers: XDFMarker[];
  enabledMarkers: Set<string>;
  viewStart: number;
  viewEnd: number;
}

export function MarkerRail({
  markers,
  enabledMarkers,
  viewStart,
  viewEnd,
}: MarkerRailProps) {
  const visibleMarkers = useMemo(() => {
    return markers.filter(
      (m) =>
        enabledMarkers.has(m.label) &&
        m.time >= viewStart &&
        m.time <= viewEnd
    );
  }, [markers, enabledMarkers, viewStart, viewEnd]);

  const viewWidth = viewEnd - viewStart;

  return (
    <div className="relative h-6 bg-muted/30 rounded-md border overflow-hidden">
      {visibleMarkers.map((m, i) => {
        const pct = ((m.time - viewStart) / viewWidth) * 100;
        const cfg = MARKER_CONFIG[m.label];
        return (
          <Tooltip key={`${m.label}-${i}`}>
            <TooltipTrigger asChild>
              <span
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full border border-background/50 cursor-default"
                style={{
                  left: `${pct}%`,
                  backgroundColor: cfg?.color ?? "#888",
                }}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <span className="font-medium">{cfg?.label ?? m.label}</span>
              <span className="text-muted-foreground ml-1.5">
                {m.time.toFixed(2)}s
              </span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
