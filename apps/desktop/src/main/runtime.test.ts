import { describe, expect, it } from "vitest";
import { parseLeagueId } from "./runtime.js";

describe("parseLeagueId", () => {
  it("accepts a numeric Sleeper league ID", () => {
    expect(parseLeagueId("289646328504385536")).toBe("289646328504385536");
  });

  it("extracts IDs from Sleeper league URLs", () => {
    expect(
      parseLeagueId("https://sleeper.com/leagues/289646328504385536/"),
    ).toBe("289646328504385536");
  });

  it("rejects unrelated URLs", () => {
    expect(() => parseLeagueId("https://example.com/not-sleeper")).toThrow(
      "Sleeper league URL",
    );
  });
});
