import { describe, it, expect, beforeEach, vi } from "vitest";
import { readCache, writeCache } from "../src/cache";
import type { Team, Game } from "../src/types";

const teams: Team[] = [
  { id: "1", name: "Mexico", code: "MEX", flagUrl: "f/mx", group: "A" },
];

const games: Game[] = [
  {
    id: "1",
    homeId: "1",
    awayId: "2",
    homeName: "Mexico",
    awayName: "RSA",
    homeScore: 2,
    awayScore: 0,
    group: "A",
    matchday: 1,
    kickoff: new Date(2026, 5, 11, 13, 0),
    finished: true,
    isGroupStage: true,
  },
];

const HOUR = 3_600_000;

describe("cache", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips teams and games, reviving kickoff as a Date", () => {
    writeCache(teams, games, 1000);
    const out = readCache(HOUR, 1000)!;
    expect(out).not.toBeNull();
    expect(out.teams).toEqual(teams);
    expect(out.games[0].kickoff).toBeInstanceOf(Date);
    expect(out.games[0].kickoff.getTime()).toBe(games[0].kickoff.getTime());
    expect(out.games[0].homeScore).toBe(2);
  });

  it("returns null when nothing is stored", () => {
    expect(readCache(HOUR, 1000)).toBeNull();
  });

  it("returns null when the cache is at or past maxAgeMs", () => {
    writeCache(teams, games, 0);
    expect(readCache(HOUR, HOUR)).toBeNull();
  });

  it("returns null when fetchedAt is not a number", () => {
    localStorage.setItem(
      "wcdak:cache:v1",
      JSON.stringify({ teams, games, fetchedAt: "not-a-number" }),
    );
    expect(readCache(HOUR, 1000)).toBeNull();
  });

  it("does not throw and returns null when localStorage access throws", () => {
    const getSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const setSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });

    expect(() => writeCache(teams, games, 1000)).not.toThrow();
    expect(readCache(HOUR, 1000)).toBeNull();

    getSpy.mockRestore();
    setSpy.mockRestore();
  });
});
