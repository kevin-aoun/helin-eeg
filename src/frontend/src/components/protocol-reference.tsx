"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { ExperimentConfig } from "@/lib/types";

interface ProtocolReferenceProps {
  config: ExperimentConfig;
}

export function ProtocolReference({ config }: ProtocolReferenceProps) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const outputFile = config.participant_id
    ? `${config.participant_id}_${date}_S${config.session_number}_R${config.run_number}_MI_markers.csv`
    : "P001_YYYYMMDD_S1_R1_MI_markers.csv";

  const totalTrials =
    config.blocks.num_blocks * config.blocks.trials_per_block;

  return (
    <Card className="py-3 gap-2">
      <CardContent className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Protocol Reference
        </p>

        {/* Output file preview */}
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">Output</p>
          <p className="font-mono text-xs text-foreground bg-muted/50 rounded px-2 py-1">
            data/{outputFile}
          </p>
        </div>

        {/* Session summary */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-muted/30 rounded px-2 py-1.5 text-center">
            <p className="text-muted-foreground text-[10px]">Total Trials</p>
            <p className="font-mono font-medium">{totalTrials}</p>
          </div>
          <div className="bg-muted/30 rounded px-2 py-1.5 text-center">
            <p className="text-muted-foreground text-[10px]">Per Class</p>
            <p className="font-mono font-medium">{totalTrials / 2} L / {totalTrials / 2} R</p>
          </div>
          <div className="bg-muted/30 rounded px-2 py-1.5 text-center">
            <p className="text-muted-foreground text-[10px]">Epoch Window</p>
            <p className="font-mono font-medium">-2 to +6s</p>
          </div>
        </div>

        {/* Keyboard shortcuts */}
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">Keyboard</p>
          <div className="flex gap-3 text-[11px]">
            <span>
              <kbd className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">SPACE</kbd>{" "}
              <span className="text-muted-foreground">Continue</span>
            </span>
            <span>
              <kbd className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">B</kbd>{" "}
              <span className="text-muted-foreground">Bad trial</span>
            </span>
            <span>
              <kbd className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">ESC</kbd>{" "}
              <span className="text-muted-foreground">Abort</span>
            </span>
          </div>
        </div>

        {/* MNE epoching snippet */}
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">MNE Epoching</p>
          <pre className="font-mono text-[10px] bg-muted/50 rounded px-2 py-1.5 overflow-x-auto text-foreground/80 leading-relaxed">
{`events = mne.find_events(raw, stim_channel="MI_Markers")
event_id = {"left_hand": 100, "right_hand": 101}
epochs = mne.Epochs(raw, events, event_id,
                    tmin=-2, tmax=6, baseline=None)`}
          </pre>
        </div>

        {/* Marker codes reference */}
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">Marker Codes</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] font-mono">
            <span><span className="text-muted-foreground">100</span> left_hand</span>
            <span><span className="text-muted-foreground">101</span> right_hand</span>
            <span><span className="text-muted-foreground">20</span> fixation_onset</span>
            <span><span className="text-muted-foreground">21</span> cue_onset</span>
            <span><span className="text-muted-foreground">23</span> mi_start</span>
            <span><span className="text-muted-foreground">24</span> mi_end</span>
            <span><span className="text-muted-foreground">200</span> bad_trial</span>
            <span><span className="text-muted-foreground">201</span> good_trial</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
