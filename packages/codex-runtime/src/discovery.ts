import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { constants } from "node:fs";
import { spawn } from "node:child_process";

const KNOWN_PATHS = [
  "/Applications/ChatGPT.app/Contents/Resources/codex",
  "/Applications/Codex.app/Contents/Resources/codex",
  join(process.env.HOME ?? "", ".local/bin/codex"),
  "/opt/homebrew/bin/codex",
  "/usr/local/bin/codex",
];

async function executable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function findCodexBinary(): Promise<string | null> {
  const explicit = process.env.CODEX_CLI_PATH;
  if (explicit && (await executable(explicit))) return explicit;

  const names =
    process.platform === "win32" ? ["codex.exe", "codex.cmd"] : ["codex"];
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    for (const name of names) {
      const candidate = join(directory, name);
      if (await executable(candidate)) return candidate;
    }
  }

  for (const candidate of KNOWN_PATHS) {
    if (candidate && (await executable(candidate))) return candidate;
  }
  return null;
}

export function codexRequiresShell(
  binaryPath: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform === "win32" && /\.(?:cmd|bat)$/i.test(binaryPath);
}

export async function readCodexVersion(binaryPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: codexRequiresShell(binaryPath),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(stdout.trim());
      else
        reject(
          new Error(
            stderr.trim() || `codex --version exited with ${String(code)}`,
          ),
        );
    });
  });
}
