import { describe, it, expect } from "vitest";
import { needsTeamsRefresh } from "../src/refresh-policy";
import type { Game } from "../src/types";

function game(homeId: string, awayId: string): Game {
  return {
    id: `${homeId}-${awayId}`,
    homeId,
    awayId,
    homeName: homeId,
    awayName: awayId,
    homeScore: 0,
    awayScore: 0,
    group: "A",
    matchday: 1,
    kickoff: new Date(2026, 5, 11, 12, 0),
    finished: false,
    isGroupStage: true,
  };
}

const HOUR = 3_600_000;

describe("needsTeamsRefresh", () => {
  it("returns true when nothing is cached", () => {
    expect(needsTeamsRefresh(null, null, [], 0, HOUR)).toBe(true);
  });

  it("returns true when the cache is at or past maxAgeMs", () => {
    const ids = new Set(["1", "2"]);
    expect(needsTeamsRefresh(ids, 0, [game("1", "2")], HOUR, HOUR)).toBe(true);
  });

  it("returns true when a game references an unknown team id", () => {
    const ids = new Set(["1", "2"]);
    expect(needsTeamsRefresh(ids, 0, [game("1", "9")], 1000, HOUR)).toBe(true);
  });

  it("returns false when fresh and all team ids are known", () => {
    const ids = new Set(["1", "2"]);
    expect(needsTeamsRefresh(ids, 0, [game("1", "2")], 1000, HOUR)).toBe(false);
  });
});
