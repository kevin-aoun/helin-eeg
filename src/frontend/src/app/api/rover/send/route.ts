import { NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";

export const runtime = "nodejs";

type RoverSendRequest = {
  command?: string;
  duration?: number;
  port?: string;
};

const VALID_COMMANDS = new Set([
  "LEFT",
  "RIGHT",
  "FORWARD",
  "BACKWARD",
  "REST",
  "STOP",
  "UNKNOWN",
  "L",
  "R",
  "F",
  "B",
  "S",
]);

function getProjectRoot(): string {
  return path.resolve(process.cwd(), "..", "..");
}

export async function POST(request: Request) {
  let body: RoverSendRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const command = String(body.command ?? "").trim().toUpperCase();
  if (!VALID_COMMANDS.has(command)) {
    return NextResponse.json({ error: "Invalid rover command" }, { status: 400 });
  }

  const duration = typeof body.duration === "number" ? body.duration : 2.0;
  if (!Number.isFinite(duration) || duration < 0 || duration > 10) {
    return NextResponse.json({ error: "Duration must be between 0 and 10 seconds" }, { status: 400 });
  }

  const scriptPath = path.join(getProjectRoot(), "src", "backend", "rover_bridge.py");
  const args = [scriptPath, command, "--duration", String(duration)];
  if (body.port) args.push("--port", body.port);

  return new Promise<Response>((resolve) => {
    execFile("python", args, { timeout: Math.max(5000, duration * 1000 + 4000) }, (err, stdout, stderr) => {
      if (err) {
        const detail = stderr?.trim() || err.message;
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(NextResponse.json(parsed, { status: 500 }));
        } catch {
          resolve(NextResponse.json({ error: `Bluetooth send failed: ${detail}` }, { status: 500 }));
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
        resolve(NextResponse.json({ error: "Failed to parse Bluetooth bridge output" }, { status: 500 }));
      }
    });
  });
}
