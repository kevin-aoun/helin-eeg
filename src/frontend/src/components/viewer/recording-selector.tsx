"use client";

import { useRef } from "react";
import { Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RecordingsIndex } from "@/lib/types";

interface RecordingSelectorProps {
  recordings: RecordingsIndex | null;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onUpload?: (file: File) => void;
  loading: boolean;
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

export function RecordingSelector({
  recordings,
  selectedPath,
  onSelect,
  onUpload,
  loading,
}: RecordingSelectorProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Card className="py-3 gap-2">
      <CardContent className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Recording
        </p>
        <Select
          value={selectedPath ?? ""}
          onValueChange={onSelect}
          disabled={loading}
        >
          <SelectTrigger className="w-full text-xs">
            <SelectValue placeholder="Select a recording..." />
          </SelectTrigger>
          <SelectContent>
            {recordings?.subjects.map((sub) =>
              sub.sessions.map((ses) => (
                <SelectGroup key={`${sub.id}-${ses.id}`}>
                  <SelectLabel className="text-[10px] text-muted-foreground">
                    {sub.id} / {ses.id}
                  </SelectLabel>
                  {ses.runs.map((run) => (
                    <SelectItem
                      key={run.path}
                      value={run.path}
                      className="text-xs"
                    >
                      Run {parseInt(run.id)} ({formatSize(run.size)})
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))
            )}
          </SelectContent>
        </Select>

        {onUpload && (
          <>
            <Separator />

            <input
              ref={inputRef}
              type="file"
              accept=".xdf"
              aria-label="Upload XDF file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              disabled={loading}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Upload .xdf file
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
