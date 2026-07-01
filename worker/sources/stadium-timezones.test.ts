import { describe, it, expect } from "vitest";
import { stadiumTimeZone, zonedWallTimeToUtc } from "./stadium-timezones";

describe("stadiumTimeZone", () => {
  it("maps known stadium ids to their IANA zones", () => {
    expect(stadiumTimeZone("7")).toBe("America/New_York"); // Atlanta
    expect(stadiumTimeZone("4")).toBe("America/Chicago"); // Dallas
    expect(stadiumTimeZone("1")).toBe("America/Mexico_City"); // Mexico City
    expect(stadiumTimeZone("3")).toBe("America/Monterrey"); // Monterrey
    expect(stadiumTimeZone("16")).toBe("America/Los_Angeles"); // Los Angeles
    expect(stadiumTimeZone("13")).toBe("America/Vancouver"); // Vancouver
  });

  it("falls back to America/New_York for an unknown id", () => {
    expect(stadiumTimeZone("999")).toBe("America/New_York");
  });
});

describe("zonedWallTimeToUtc", () => {
  it("interprets wall-clock time in the given zone (summer offsets)", () => {
    // noon EDT (UTC-4) -> 16:00Z
    expect(
      zonedWallTimeToUtc(2026, 7, 1, 12, 0, "America/New_York").toISOString(),
    ).toBe("2026-07-01T16:00:00.000Z");
    // noon CDT (UTC-5) -> 17:00Z
    expect(
      zonedWallTimeToUtc(2026, 7, 1, 12, 0, "America/Chicago").toISOString(),
    ).toBe("2026-07-01T17:00:00.000Z");
    // noon Mexico City (UTC-6, no DST) -> 18:00Z
    expect(
      zonedWallTimeToUtc(2026, 7, 1, 12, 0, "America/Mexico_City").toISOString(),
    ).toBe("2026-07-01T18:00:00.000Z");
    // noon PDT (UTC-7) -> 19:00Z
    expect(
      zonedWallTimeToUtc(2026, 7, 1, 12, 0, "America/Los_Angeles").toISOString(),
    ).toBe("2026-07-01T19:00:00.000Z");
  });
});
