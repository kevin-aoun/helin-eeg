"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorPicker } from "@/components/color-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrialTimeline } from "@/components/trial-timeline";
import { DEFAULT_CONFIG, type ExperimentConfig } from "@/lib/types";
import { toast } from "sonner";

const STORAGE_KEY = "helin-defaults";

interface ConfigFormProps {
  config: ExperimentConfig;
  onChange: (config: ExperimentConfig) => void;
  disabled: boolean;
}

function parseInt2(value: string, fallback: number): number {
  const n = parseInt(value);
  return isNaN(n) ? fallback : n;
}

export function ConfigForm({ config, onChange, disabled }: ConfigFormProps) {
  function updateTiming(key: keyof ExperimentConfig["timing"], value: number) {
    onChange({ ...config, timing: { ...config.timing, [key]: value } });
  }

  function updateBlocks(key: keyof ExperimentConfig["blocks"], value: number) {
    onChange({ ...config, blocks: { ...config.blocks, [key]: value } });
  }

  const trialDuration =
    config.timing.baseline +
    config.timing.cue +
    config.timing.mi +
    (config.timing.rest_min + config.timing.rest_max) / 2;
  const totalTrials =
    config.blocks.num_blocks * config.blocks.trials_per_block;
  const estMinutes = Math.ceil(
    (totalTrials * trialDuration +
      config.blocks.practice_trials * trialDuration) /
      60
  );

  return (
    <div className="space-y-2">
      {/* Session */}
      <Card className="py-3 gap-2">
        <CardContent className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Session</p>
          {/* Row 1: Identity */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="participant_id" className="text-[11px] text-muted-foreground">Participant</Label>
              <Input
                id="participant_id"
                placeholder="P001"
                value={config.participant_id ?? ""}
                onChange={(e) => onChange({ ...config, participant_id: e.target.value })}
                disabled={disabled}
                className="w-20 h-7 text-sm"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="session_number" className="text-[11px] text-muted-foreground">Session</Label>
              <Input
                id="session_number"
                type="number"
                min={1}
                value={config.session_number}
                onChange={(e) => onChange({ ...config, session_number: parseInt2(e.target.value, 1) })}
                disabled={disabled}
                className="w-14 h-7 text-sm text-center"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="run_number" className="text-[11px] text-muted-foreground">Run</Label>
              <Input
                id="run_number"
                type="number"
                min={1}
                value={config.run_number ?? 1}
                onChange={(e) => onChange({ ...config, run_number: parseInt2(e.target.value, 1) })}
                disabled={disabled}
                className="w-14 h-7 text-sm text-center"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="device_frequency" className="text-[11px] text-muted-foreground">Device</Label>
              <Select
                value={String(config.device_frequency)}
                onValueChange={(v) => onChange({ ...config, device_frequency: parseInt(v) })}
                disabled={disabled}
              >
                <SelectTrigger id="device_frequency" className="w-40 h-7 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="250">Unicorn (250 Hz)</SelectItem>
                  <SelectItem value="128">Emotiv (128 Hz)</SelectItem>
                  <SelectItem value="256">Hospital (256 Hz)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Row 2: Display & colors */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Checkbox
                id="fullscreen"
                checked={config.fullscreen}
                onCheckedChange={(checked) => onChange({ ...config, fullscreen: !!checked })}
                disabled={disabled}
              />
              <Label htmlFor="fullscreen" className="text-[11px] text-muted-foreground cursor-pointer">Fullscreen</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="screen" className="text-[11px] text-muted-foreground">Screen</Label>
              <Input
                id="screen"
                type="number"
                min={0}
                max={3}
                value={config.screen}
                onChange={(e) => onChange({ ...config, screen: parseInt2(e.target.value, 0) })}
                disabled={disabled}
                className="w-12 h-7 text-sm text-center"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Checkbox
                id="show_feedback"
                checked={config.show_feedback}
                onCheckedChange={(checked) => onChange({ ...config, show_feedback: !!checked })}
                disabled={disabled}
              />
              <Label htmlFor="show_feedback" className="text-[11px] text-muted-foreground cursor-pointer">Neurofeedback</Label>
            </div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-1.5">
              <ColorPicker
                value={config.colors.left}
                onChange={(c) => onChange({ ...config, colors: { ...config.colors, left: c } })}
                disabled={disabled}
                label="L"
              />
              <ColorPicker
                value={config.colors.right}
                onChange={(c) => onChange({ ...config, colors: { ...config.colors, right: c } })}
                disabled={disabled}
                label="R"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trial Timeline */}
      <Card className="py-4 gap-2">
        <CardContent>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Trial Timeline</p>
          <TrialTimeline
            timing={config.timing}
            onChange={updateTiming}
            disabled={disabled}
          />
        </CardContent>
      </Card>

      {/* Blocks */}
      <Card className="py-3 gap-2">
        <CardContent>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Blocks</p>
          <div className="flex items-center gap-3 flex-wrap">
            {[
              {
                id: "num_blocks",
                label: "Blocks",
                key: "num_blocks" as const,
                min: 1,
                max: 5,
                step: 1,
                fallback: 2,
              },
              {
                id: "trials_per_block",
                label: "Trials/Block",
                key: "trials_per_block" as const,
                min: 10,
                max: 100,
                step: 2,
                fallback: 50,
              },
              {
                id: "practice_trials",
                label: "Practice",
                key: "practice_trials" as const,
                min: 0,
                max: 20,
                step: 2,
                fallback: 0,
              },
              {
                id: "break_duration",
                label: "Break (s)",
                key: "break_duration" as const,
                min: 0,
                max: 600,
                step: 10,
                fallback: 120,
              },
            ].map((field) => (
              <div key={field.id} className="flex items-center gap-1.5">
                <Label
                  htmlFor={field.id}
                  className="text-[11px] text-muted-foreground whitespace-nowrap"
                >
                  {field.label}
                </Label>
                <Input
                  id={field.id}
                  type="number"
                  step={field.step}
                  min={field.min}
                  max={field.max}
                  value={config.blocks[field.key]}
                  onChange={(e) =>
                    updateBlocks(
                      field.key,
                      parseInt2(e.target.value, field.fallback)
                    )
                  }
                  disabled={disabled}
                  className="w-18 h-7 text-sm text-center"
                />
              </div>
            ))}
            <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
              <span>{totalTrials} trials</span>
              <span>~{estMinutes} min</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save / Load defaults */}
      {!disabled && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              const defaults = {
                colors: config.colors,
                timing: config.timing,
                blocks: config.blocks,
              };
              localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
              toast("Defaults saved");
            }}
          >
            Save as Default
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              const raw = localStorage.getItem(STORAGE_KEY);
              if (raw) {
                const defaults = JSON.parse(raw);
                onChange({
                  ...config,
                  colors: defaults.colors ?? config.colors,
                  timing: defaults.timing ?? config.timing,
                  blocks: defaults.blocks ?? config.blocks,
                });
                toast("Defaults loaded");
              } else {
                onChange({
                  ...config,
                  colors: DEFAULT_CONFIG.colors,
                  timing: DEFAULT_CONFIG.timing,
                  blocks: DEFAULT_CONFIG.blocks,
                });
                toast("Factory defaults loaded");
              }
            }}
          >
            Load Defaults
          </Button>
        </div>
      )}
    </div>
  );
}
