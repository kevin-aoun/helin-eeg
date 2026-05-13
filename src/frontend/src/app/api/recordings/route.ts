import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { RecordingsIndex, RecordingSubject, RecordingSession } from "@/lib/types";

function getProjectRoot(): string {
  return path.resolve(process.cwd(), "..", "..");
}

export async function GET() {
  const projectRoot = getProjectRoot();
  const dataDir = path.join(projectRoot, "data");

  if (!fs.existsSync(dataDir)) {
    return NextResponse.json({ subjects: [] } satisfies RecordingsIndex);
  }

  const subjectsMap = new Map<string, Map<string, { id: string; filename: string; path: string; size: number }[]>>();

  // Walk data/**/sub-*/ses-*/eeg/*.xdf, including data/demo sample folders.
  const subDirs = fs.readdirSync(dataDir, { recursive: true })
    .filter((entry) => typeof entry === "string" && path.basename(entry).startsWith("sub-")) as string[];

  for (const subEntry of subDirs) {
    const subDir = path.basename(subEntry);
    const subId = subDir.replace("sub-", "");
    const subPath = path.join(dataDir, subEntry);

    if (!fs.statSync(subPath).isDirectory()) continue;

    const sesDirs = fs.readdirSync(subPath).filter((d) => d.startsWith("ses-"));

    for (const sesDir of sesDirs) {
      const sesId = sesDir.replace("ses-", "");
      const eegPath = path.join(subPath, sesDir, "eeg");

      if (!fs.existsSync(eegPath) || !fs.statSync(eegPath).isDirectory()) continue;

      const xdfFiles = fs.readdirSync(eegPath).filter((f) => f.endsWith(".xdf"));

      for (const xdfFile of xdfFiles) {
        const runMatch = xdfFile.match(/run-(\d+)/);
        const runId = runMatch ? runMatch[1] : "001";
        const relativeToData = path.relative(dataDir, path.join(eegPath, xdfFile));
        const filePath = path.join("data", relativeToData);
        const stat = fs.statSync(path.join(eegPath, xdfFile));

        if (!subjectsMap.has(subId)) subjectsMap.set(subId, new Map());
        const sessions = subjectsMap.get(subId)!;
        if (!sessions.has(sesId)) sessions.set(sesId, []);
        sessions.get(sesId)!.push({
          id: runId,
          filename: xdfFile,
          path: filePath.replace(/\\/g, "/"),
          size: stat.size,
        });
      }
    }
  }

  // Convert to structured response
  const subjects: RecordingSubject[] = [];
  for (const [subId, sessionsMap] of subjectsMap) {
    const sessions: RecordingSession[] = [];
    for (const [sesId, runs] of sessionsMap) {
      sessions.push({ id: sesId, runs: runs.sort((a, b) => a.id.localeCompare(b.id)) });
    }
    subjects.push({
      id: subId,
      sessions: sessions.sort((a, b) => a.id.localeCompare(b.id)),
    });
  }

  subjects.sort((a, b) => a.id.localeCompare(b.id));

  return NextResponse.json({ subjects } satisfies RecordingsIndex);
}
