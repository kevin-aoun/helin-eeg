import { NextResponse } from "next/server";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

function getProjectRoot(): string {
  return path.resolve(process.cwd(), "..", "..");
}

export async function POST(request: Request) {
  let body: { path?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reqPath = body.path;
  if (!reqPath || typeof reqPath !== "string") {
    return NextResponse.json({ error: "Missing 'path' field" }, { status: 400 });
  }

  // Security: prevent directory traversal.
  if (reqPath.includes("..") || !reqPath.startsWith("data/") || !reqPath.endsWith(".xdf")) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  const projectRoot = getProjectRoot();
  const absolutePath = path.join(projectRoot, reqPath);

  // Verify the resolved path is still within the data directory.
  const dataDir = path.resolve(projectRoot, "data");
  if (!path.resolve(absolutePath).startsWith(dataDir)) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  if (!fs.existsSync(absolutePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const scriptPath = path.join(projectRoot, "src", "backend", "read_xdf.py");

  return new Promise<Response>((resolve) => {
    execFile(
      "python",
      [scriptPath, absolutePath],
      { timeout: 30000, maxBuffer: 50 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const msg = stderr?.trim() || err.message;
          resolve(
            NextResponse.json({ error: `Failed to read XDF: ${msg}` }, { status: 500 })
          );
          return;
        }
        try {
          const data = JSON.parse(stdout.trim());
          if (data.error) {
            resolve(NextResponse.json({ error: data.error }, { status: 500 }));
          } else {
            resolve(NextResponse.json(data));
          }
        } catch {
          resolve(
            NextResponse.json({ error: "Failed to parse XDF reader output" }, { status: 500 })
          );
        }
      }
    );
  });
}
