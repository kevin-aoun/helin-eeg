"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { MARKER_CONFIG } from "@/lib/viewer-constants";
import type { XDFMarker } from "@/lib/types";

interface ChannelChartProps {
  channelName: string;
  timeData: number[];
  channelData: number[];
  markers: XDFMarker[];
  viewStart: number;
  viewEnd: number;
  amplitudeGain: number;
  isLast: boolean;
}

export function ChannelChart({
  channelName,
  timeData,
  channelData,
  markers,
  viewStart,
  viewEnd,
  amplitudeGain,
  isLast,
}: ChannelChartProps) {
  const windowedData = useMemo(() => {
    const points: { time: number; value: number }[] = [];
    for (let i = 0; i < timeData.length; i++) {
      const t = timeData[i];
      if (t < viewStart) continue;
      if (t > viewEnd) break;
      points.push({ time: t, value: channelData[i] });
    }
    return points;
  }, [timeData, channelData, viewStart, viewEnd]);

  const yDomain = useMemo(() => {
    if (windowedData.length === 0) return [-100, 100];
    let sum = 0;
    let sumSq = 0;
    for (const p of windowedData) {
      sum += p.value;
      sumSq += p.value * p.value;
    }
    const n = windowedData.length;
    const mean = sum / n;
    const std = Math.sqrt(sumSq / n - mean * mean) || 50;
    const range = (3 * std) / amplitudeGain;
    return [mean - range, mean + range];
  }, [windowedData, amplitudeGain]);

  const visibleMarkers = useMemo(
    () => markers.filter((m) => m.time >= viewStart && m.time <= viewEnd),
    [markers, viewStart, viewEnd]
  );

  const chartConfig = {
    value: { label: channelName, color: "var(--foreground)" },
  };

  return (
    <div className="relative">
      <span className="absolute left-1 top-0.5 z-10 text-[10px] font-mono text-muted-foreground pointer-events-none">
        {channelName}
      </span>
      <ChartContainer config={chartConfig} className="h-[70px] w-full">
        <LineChart
          data={windowedData}
          margin={{ left: 0, right: 0, top: 2, bottom: isLast ? 20 : 0 }}
          syncId="eeg"
        >
          <XAxis
            dataKey="time"
            type="number"
            domain={[viewStart, viewEnd]}
            hide={!isLast}
            tickFormatter={(v: number) => `${v.toFixed(1)}s`}
            tickLine={false}
            axisLine={false}
            fontSize={10}
            tickCount={8}
          />
          <YAxis domain={yDomain} hide />
          {visibleMarkers.map((m, i) => (
            <ReferenceLine
              key={`${m.label}-${i}`}
              x={m.time}
              stroke={MARKER_CONFIG[m.label]?.color ?? "#888"}
              strokeDasharray="3 3"
              strokeWidth={1}
              strokeOpacity={0.5}
            />
          ))}
          <ChartTooltip
            cursor={{ stroke: "var(--color-muted-foreground)", strokeWidth: 1, strokeOpacity: 0.4 }}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value) => [
                  <span key="v" className="font-mono">{Number(value).toFixed(1)} <span className="text-muted-foreground">µV</span></span>,
                  channelName,
                ]}
              />
            }
          />
          <Line
            dataKey="value"
            type="linear"
            stroke="var(--foreground)"
            strokeWidth={1}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
