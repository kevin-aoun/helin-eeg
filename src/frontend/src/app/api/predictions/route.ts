import { NextResponse } from "next/server";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

type PredictionRequest = {
  path?: string;
  start?: number;
  end?: number;
  relative?: boolean;
  window?: number;
  segment?: number;
  commandDuration?: number;
};

function getProjectRoot(): string {
  return path.resolve(process.cwd(), "..", "..");
}

function resolveRecordingPath(projectRoot: string, reqPath: string): string | null {
  if (reqPath.includes("..") || !reqPath.endsWith(".xdf")) return null;

  if (!reqPath.startsWith("data/")) return null;

  const absolutePath = path.resolve(projectRoot, reqPath);
  const allowedRoots = [path.resolve(projectRoot, "data")];

  if (!allowedRoots.some((root) => absolutePath.startsWith(root))) return null;
  return absolutePath;
}

export async function POST(request: Request) {
  let body: PredictionRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.path || typeof body.path !== "string") {
    return NextResponse.json({ error: "Missing recording path" }, { status: 400 });
  }

  const projectRoot = getProjectRoot();
  const recordingPath = resolveRecordingPath(projectRoot, body.path);
  if (!recordingPath) {
    return NextResponse.json({ error: "Invalid recording path" }, { status: 400 });
  }

  if (!fs.existsSync(recordingPath)) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const scriptPath = path.join(projectRoot, "src", "backend", "eeg_prediction.py");
  const args = [scriptPath, recordingPath];

  if (typeof body.start === "number") args.push("--start", String(body.start));
  if (typeof body.end === "number") args.push("--end", String(body.end));
  if (body.relative) args.push("--relative");
  if (typeof body.window === "number") args.push("--window", String(body.window));
  if (typeof body.segment === "number") args.push("--segment", String(body.segment));
  if (typeof body.commandDuration === "number") {
    args.push("--command-duration", String(body.commandDuration));
  }

  return new Promise<Response>((resolve) => {
    execFile(
      "python",
      args,
      { timeout: 120000, maxBuffer: 80 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const detail = stderr?.trim() || err.message;
          try {
            const parsed = JSON.parse(stdout.trim());
            resolve(NextResponse.json(parsed, { status: 500 }));
          } catch {
            resolve(NextResponse.json({ error: `Prediction failed: ${detail}` }, { status: 500 }));
          }
          return;
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          if (parsed.error) {
            resolve(NextResponse.json(parsed, { status: 500 }));
          } else {
            resolve(NextResponse.json(parsed));
          }
        } catch {
          resolve(NextResponse.json({ error: "Failed to parse prediction output" }, { status: 500 }));
        }
      }
    );
  });
}
