import { describe, expect, test } from "vitest";
import { formatDateTime, formatRelativeTime, isOlderThan } from "./time.js";

const NOW = "2026-07-17T19:00:00.000Z";

describe("time helpers", () => {
  test("formats compact relative freshness", () => {
    expect(formatRelativeTime("2026-07-17T18:59:31.000Z", NOW)).toBe(
      "just now",
    );
    expect(formatRelativeTime("2026-07-17T18:31:00.000Z", NOW)).toBe("29m ago");
    expect(formatRelativeTime("2026-07-16T18:59:59.000Z", NOW)).toBe("1d ago");
  });

  test("handles invalid and future timestamps safely", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBe("Unknown time");
    expect(formatRelativeTime("2026-07-18T19:00:00.000Z", NOW)).toBe(
      "just now",
    );
    expect(formatDateTime("not-a-date")).toBe("Unknown time");
  });

  test("compares freshness against a supplied reference time", () => {
    expect(isOlderThan("2026-07-17T06:59:59.000Z", 43_200_000, NOW)).toBe(true);
    expect(isOlderThan("2026-07-17T07:00:00.000Z", 43_200_000, NOW)).toBe(
      false,
    );
  });
});
