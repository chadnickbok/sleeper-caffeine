import { describe, expect, it } from "vitest";
import { createWindowOptions, MINIMUM_WINDOW_SIZE } from "./window-config.js";

describe("desktop window configuration", () => {
  it("uses custom inset chrome only on macOS", () => {
    expect(createWindowOptions("darwin")).toMatchObject({
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 18 },
    });
    expect(createWindowOptions("win32")).not.toHaveProperty("titleBarStyle");
    expect(createWindowOptions("linux")).not.toHaveProperty("titleBarStyle");
  });

  it("enforces the documented minimum desktop viewport everywhere", () => {
    for (const platform of ["darwin", "win32", "linux"] as const) {
      expect(createWindowOptions(platform)).toMatchObject({
        minWidth: MINIMUM_WINDOW_SIZE.width,
        minHeight: MINIMUM_WINDOW_SIZE.height,
      });
    }
  });
});
