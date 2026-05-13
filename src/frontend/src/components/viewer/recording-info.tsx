"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { XDFData } from "@/lib/types";

interface RecordingInfoProps {
  data: XDFData;
  filename: string;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function RecordingInfo({ data, filename }: RecordingInfoProps) {
  return (
    <Card className="py-3 gap-2">
      <CardContent className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Info
        </p>
        <p className="font-mono text-[10px] text-foreground/70 bg-muted/50 rounded px-2 py-1 truncate">
          {filename}
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <div>
            <span className="text-muted-foreground">Duration</span>
          </div>
          <div className="font-mono text-right">{formatDuration(data.duration)}</div>

          <div>
            <span className="text-muted-foreground">Sample Rate</span>
          </div>
          <div className="font-mono text-right">{data.srate} Hz</div>

          <div>
            <span className="text-muted-foreground">Channels</span>
          </div>
          <div className="font-mono text-right">{data.channels.length}</div>

          <div>
            <span className="text-muted-foreground">Total Samples</span>
          </div>
          <div className="font-mono text-right">
            {data.total_samples.toLocaleString()}
          </div>

          <div>
            <span className="text-muted-foreground">Markers</span>
          </div>
          <div className="font-mono text-right">{data.markers.length}</div>
        </div>
      </CardContent>
    </Card>
  );
}
