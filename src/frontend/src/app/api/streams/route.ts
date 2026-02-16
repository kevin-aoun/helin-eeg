import { NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";

function getProjectRoot(): string {
  return path.resolve(process.cwd(), "..", "..");
}

export async function GET() {
  const scriptPath = path.join(
    getProjectRoot(),
    "src",
    "backend",
    "check_streams.py"
  );

  return new Promise<Response>((resolve) => {
    execFile("python", [scriptPath], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve(NextResponse.json([]));
        return;
      }
      try {
        const streams = JSON.parse(stdout.trim());
        resolve(NextResponse.json(streams));
      } catch {
        resolve(NextResponse.json([]));
      }
    });
  });
}
