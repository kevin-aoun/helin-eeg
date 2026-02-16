import { NextResponse } from "next/server";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

let stimulusProcess: ChildProcess | null = null;
let feedbackProcess: ChildProcess | null = null;
let processError: string | null = null;
let processExited = false;

function getProjectRoot(): string {
  return path.resolve(process.cwd(), "..", "..");
}

export async function POST(request: Request) {
  if (stimulusProcess && !stimulusProcess.killed) {
    return NextResponse.json(
      { error: "A session is already running" },
      { status: 409 }
    );
  }

  try {
    const config = await request.json();
    const projectRoot = getProjectRoot();
    const tmpDir = path.join(projectRoot, "tmp");
    const dataDir = path.join(projectRoot, "data");

    fs.mkdirSync(tmpDir, { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });

    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const statusPath = path.join(tmpDir, "status.json");
    fs.writeFileSync(
      statusPath,
      JSON.stringify({
        state: "practice",
        phase: "none",
        current_trial: 0,
        total_trials: config.blocks.trials_per_block,
        current_block: 0,
        total_blocks: config.blocks.num_blocks,
        bad_trials: 0,
        elapsed_seconds: 0,
        output_file: "",
      })
    );

    const scriptPath = path.join(
      projectRoot,
      "src",
      "backend",
      "mi_stimulus.py"
    );

    processError = null;
    processExited = false;

    stimulusProcess = spawn("python", [scriptPath, "--config", configPath], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Capture stderr for debugging (LSL/PsychoPy both write info to stderr)
    let stderrBuffer = "";
    stimulusProcess.stderr?.on("data", (data: Buffer) => {
      stderrBuffer += data.toString();
      console.error("[mi_stimulus]", data.toString());
    });

    stimulusProcess.stdout?.on("data", (data: Buffer) => {
      console.log("[mi_stimulus]", data.toString());
    });

    stimulusProcess.on("exit", (code) => {
      processExited = true;
      if (code !== 0 && code !== null) {
        processError = stderrBuffer.slice(-500) || `Process exited with code ${code}`;
        // Only write fallback status if PsychoPy didn't write a final one
        try {
          const existing = fs.existsSync(statusPath)
            ? JSON.parse(fs.readFileSync(statusPath, "utf-8"))
            : null;
          if (!existing || (existing.state !== "aborted" && existing.state !== "completed")) {
            fs.writeFileSync(
              statusPath,
              JSON.stringify({
                state: "aborted",
                phase: "none",
                current_trial: 0,
                total_trials: 0,
                current_block: 0,
                total_blocks: 0,
                bad_trials: 0,
                elapsed_seconds: 0,
                output_file: "",
              })
            );
          }
        } catch { /* ignore */ }
      }
      stimulusProcess = null;
    });

    stimulusProcess.on("error", (err) => {
      processError = `Failed to start Python: ${err.message}. Is Python installed and on PATH?`;
      processExited = true;
      console.error("[mi_stimulus] spawn error:", err.message);
      stimulusProcess = null;
    });

    // Spawn feedback processor (best-effort — session runs fine without it)
    const feedbackScriptPath = path.join(projectRoot, "src", "backend", "feedback.py");
    feedbackProcess = spawn("python", [feedbackScriptPath, "--config", configPath], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    feedbackProcess.stderr?.on("data", (data: Buffer) => {
      console.error("[feedback]", data.toString());
    });
    feedbackProcess.stdout?.on("data", (data: Buffer) => {
      console.log("[feedback]", data.toString());
    });
    feedbackProcess.on("exit", () => {
      feedbackProcess = null;
    });
    feedbackProcess.on("error", (err) => {
      console.error("[feedback] spawn error:", err.message);
      feedbackProcess = null;
    });

    // Wait briefly to catch immediate failures (e.g. python not found, import error)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Only fail if the process actually died — stderr output from LSL/PsychoPy is normal
    if (processExited) {
      return NextResponse.json(
        { error: processError || stderrBuffer.slice(-500) || "Process exited immediately" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  if (stimulusProcess && !stimulusProcess.killed) {
    // Read current status before killing so we preserve progress
    const projectRoot = getProjectRoot();
    const statusPath = path.join(projectRoot, "tmp", "status.json");
    let currentStatus = null;
    try {
      currentStatus = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
    } catch { /* ignore */ }

    stimulusProcess.kill();
    stimulusProcess = null;

    // Kill feedback process
    if (feedbackProcess && !feedbackProcess.killed) {
      feedbackProcess.kill();
      feedbackProcess = null;
    }
    try {
      const feedbackPath = path.join(projectRoot, "tmp", "feedback.json");
      if (fs.existsSync(feedbackPath)) fs.unlinkSync(feedbackPath);
    } catch { /* ignore */ }

    // Mark as aborted, preserving last known progress
    if (currentStatus && currentStatus.state !== "aborted" && currentStatus.state !== "completed") {
      try {
        fs.writeFileSync(
          statusPath,
          JSON.stringify({ ...currentStatus, state: "aborted", phase: "none" })
        );
      } catch { /* ignore */ }
    }
  }
  return NextResponse.json({ success: true });
}

// GET: return process status (for frontend polling)
export async function GET() {
  return NextResponse.json({
    running: stimulusProcess !== null && !stimulusProcess.killed,
    feedbackRunning: feedbackProcess !== null && !feedbackProcess.killed,
    error: processExited ? processError : null,
  });
}
