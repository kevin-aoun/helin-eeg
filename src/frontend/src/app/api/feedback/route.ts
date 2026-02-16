import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

function getProjectRoot(): string {
  return path.resolve(process.cwd(), "..", "..");
}

const DISCONNECTED_STATE = {
  timestamp: 0,
  connected: false,
  stream_name: null,
  channels: {
    C3: { mu_power: 0, beta_power: 0 },
    C4: { mu_power: 0, beta_power: 0 },
  },
  laterality_index: 0,
  mu_suppression: 0,
  error: "Feedback not running",
};

export async function GET() {
  try {
    const feedbackPath = path.join(getProjectRoot(), "tmp", "feedback.json");

    if (!fs.existsSync(feedbackPath)) {
      return NextResponse.json(DISCONNECTED_STATE);
    }

    const data = fs.readFileSync(feedbackPath, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json(
      { error: "Failed to read feedback" },
      { status: 500 }
    );
  }
}
