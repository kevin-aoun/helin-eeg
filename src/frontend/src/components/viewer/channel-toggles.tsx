"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface ChannelTogglesProps {
  channels: string[];
  enabledChannels: Set<string>;
  onToggle: (channel: string) => void;
  onToggleAll: () => void;
}

export function ChannelToggles({
  channels,
  enabledChannels,
  onToggle,
  onToggleAll,
}: ChannelTogglesProps) {
  const allEnabled = channels.every((ch) => enabledChannels.has(ch));

  return (
    <Card className="py-3 gap-2">
      <CardContent>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Channels
          </p>
          <button
            onClick={onToggleAll}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {allEnabled ? "Hide all" : "Show all"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {channels.map((ch) => (
            <div key={ch} className="flex items-center gap-1.5">
              <Checkbox
                id={`ch-${ch}`}
                checked={enabledChannels.has(ch)}
                onCheckedChange={() => onToggle(ch)}
              />
              <Label
                htmlFor={`ch-${ch}`}
                className="text-xs font-mono cursor-pointer"
              >
                {ch}
              </Label>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
