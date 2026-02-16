"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const PRESETS = [
  "#4A9FD9", // blue
  "#E8B931", // yellow
  "#EF4444", // red
  "#22C55E", // green
  "#F97316", // orange
  "#A855F7", // purple
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#FFFFFF", // white
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  label?: string;
}

export function ColorPicker({ value, onChange, disabled, label }: ColorPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className="h-7 w-12 px-1.5 gap-1.5"
        >
          <span
            className="h-4 w-4 rounded-sm border border-border shrink-0"
            style={{ backgroundColor: value }}
          />
          {label && (
            <span className="text-[11px] text-muted-foreground">{label}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-3" align="start">
        <div className="grid grid-cols-5 gap-1.5 mb-2">
          {PRESETS.map((color) => (
            <button
              key={color}
              onClick={() => onChange(color)}
              className="h-7 w-7 rounded-md border border-border hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-ring"
              style={{ backgroundColor: color }}
            >
              {color === value && (
                <span className="flex items-center justify-center">
                  <span
                    className="text-xs font-bold"
                    style={{
                      color: ["#FFFFFF", "#E8B931", "#22C55E", "#06B6D4"].includes(color)
                        ? "#000"
                        : "#fff",
                    }}
                  >
                    ✓
                  </span>
                </span>
              )}
            </button>
          ))}
        </div>
        <Input
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange(v);
          }}
          placeholder="#hex"
          className="h-7 text-xs font-mono"
        />
      </PopoverContent>
    </Popover>
  );
}
