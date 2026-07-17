import { describe, expect, it } from "vitest";
import { codexRequiresShell } from "./discovery.js";

describe("Codex process discovery", () => {
  it("uses the Windows command interpreter only for command shims", () => {
    expect(codexRequiresShell("C:\\tools\\codex.cmd", "win32")).toBe(true);
    expect(codexRequiresShell("C:\\tools\\codex.bat", "win32")).toBe(true);
    expect(codexRequiresShell("C:\\tools\\codex.exe", "win32")).toBe(false);
    expect(codexRequiresShell("/usr/local/bin/codex", "linux")).toBe(false);
    expect(codexRequiresShell("/opt/homebrew/bin/codex", "darwin")).toBe(false);
  });
});
