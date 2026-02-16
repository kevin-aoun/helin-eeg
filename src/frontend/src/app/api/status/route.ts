import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

function getProjectRoot(): string {
  return path.resolve(process.cwd(), "..", "..");
}

export async function GET() {
  try {
    const statusPath = path.join(getProjectRoot(), "tmp", "status.json");

    if (!fs.existsSync(statusPath)) {
      return NextResponse.json({
        state: "idle",
        phase: "none",
        current_trial: 0,
        total_trials: 0,
        current_block: 0,
        total_blocks: 0,
        bad_trials: 0,
        elapsed_seconds: 0,
        output_file: "",
      });
    }

    const data = fs.readFileSync(statusPath, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json(
      { error: "Failed to read status" },
      { status: 500 }
    );
  }
}
