import { describe, expect, it } from "vitest";
import { relative, resolve } from "node:path";
import { resolveAppPaths } from "./app-paths.js";

describe("packaged application paths", () => {
  it("keeps every mutable artifact below Electron userData", () => {
    const userData = resolve("test-user-data");
    const paths = resolveAppPaths(userData);

    for (const path of Object.values(paths)) {
      expect(relative(userData, path)).not.toMatch(/^\.\.(?:[\\/]|$)/);
    }
    expect(paths.databasePath).toMatch(/sleeper-caffeine\.sqlite$/);
    expect(paths.cacheDir).toMatch(/cache[\\/]sleeper$/);
    expect(paths.codexHome).toMatch(/codex-home$/);
    expect(paths.analystWorkspace).toMatch(/analyst-workspace$/);
  });
});
