import { NextResponse } from "next/server";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

function getProjectRoot(): string {
  return path.resolve(process.cwd(), "..", "..");
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file || !file.name.endsWith(".xdf")) {
    return NextResponse.json(
      { error: "Please upload a .xdf file" },
      { status: 400 }
    );
  }

  const projectRoot = getProjectRoot();
  const tmpDir = path.join(projectRoot, "tmp");

  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  // Save uploaded file to tmp/
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join(tmpDir, safeName);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  // Run the XDF reader on it
  const scriptPath = path.join(projectRoot, "src", "backend", "read_xdf.py");

  return new Promise<Response>((resolve) => {
    execFile(
      "python",
      [scriptPath, filePath],
      { timeout: 30000, maxBuffer: 50 * 1024 * 1024 },
      (err, stdout, stderr) => {
        // Clean up temp file
        try {
          fs.unlinkSync(filePath);
        } catch {
          /* ignore */
        }

        if (err) {
          const msg = stderr?.trim() || err.message;
          resolve(
            NextResponse.json(
              { error: `Failed to read XDF: ${msg}` },
              { status: 500 }
            )
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
            NextResponse.json(
              { error: "Failed to parse XDF reader output" },
              { status: 500 }
            )
          );
        }
      }
    );
  });
}
