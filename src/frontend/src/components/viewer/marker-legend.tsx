"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { MARKER_CONFIG, MARKER_GROUPS } from "@/lib/viewer-constants";
import type { XDFMarker } from "@/lib/types";

interface MarkerLegendProps {
  markers: XDFMarker[];
  enabledMarkers: Set<string>;
  onToggle: (label: string) => void;
  onToggleGroup: (group: string) => void;
}

export function MarkerLegend({
  markers,
  enabledMarkers,
  onToggle,
  onToggleGroup,
}: MarkerLegendProps) {
  // Count occurrences of each marker type
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of markers) {
      c.set(m.label, (c.get(m.label) ?? 0) + 1);
    }
    return c;
  }, [markers]);

  // Only show marker types that exist in the data
  const presentTypes = useMemo(() => {
    const types = new Set<string>();
    for (const m of markers) types.add(m.label);
    return types;
  }, [markers]);

  // Group markers
  const grouped = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const group of MARKER_GROUPS) {
      const types = Object.entries(MARKER_CONFIG)
        .filter(([key, cfg]) => cfg.group === group && presentTypes.has(key))
        .map(([key]) => key);
      if (types.length > 0) groups[group] = types;
    }
    // Add any unknown marker types
    const known = new Set(Object.keys(MARKER_CONFIG));
    const unknown = [...presentTypes].filter((t) => !known.has(t));
    if (unknown.length > 0) groups["Other"] = unknown;
    return groups;
  }, [presentTypes]);

  return (
    <Card className="py-3 gap-2">
      <CardContent>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Markers
        </p>
        <div className="max-h-[320px] overflow-y-auto space-y-3">
            {Object.entries(grouped).map(([group, types]) => {
              const allEnabled = types.every((t) => enabledMarkers.has(t));
              return (
                <div key={group}>
                  <button
                    className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 hover:text-foreground transition-colors cursor-pointer"
                    onClick={() => onToggleGroup(group)}
                    title={allEnabled ? "Hide all in group" : "Show all in group"}
                  >
                    {group}
                  </button>
                  <div className="space-y-1">
                    {types.map((type) => {
                      const cfg = MARKER_CONFIG[type];
                      const count = counts.get(type) ?? 0;
                      return (
                        <div
                          key={type}
                          className="flex items-center gap-2 text-xs"
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: cfg?.color ?? "#888",
                            }}
                          />
                          <span className="flex-1 truncate">
                            {cfg?.label ?? type}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1 py-0 font-mono"
                          >
                            {count}
                          </Badge>
                          <Switch
                            checked={enabledMarkers.has(type)}
                            onCheckedChange={() => onToggle(type)}
                            className="scale-75"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      </CardContent>
    </Card>
  );
}
