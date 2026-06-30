import { describe, it, expect } from "vitest";
import {
  roundOf,
  buildBracket,
  selectView,
  activeRound,
  bracketHasMatches,
} from "../src/bracket";
import type { Team, Game } from "../src/types";
import type { DashboardConfig } from "../src/config";

function team(id: string, code: string): Team {
  return { id, code, name: code, flagUrl: `flag/${code}.png`, group: "A" };
}

function ko(
  id: string,
  matchday: number,
  homeId: string,
  awayId: string,
  opts: Partial<Game> = {},
): Game {
  return {
    id,
    homeId,
    awayId,
    homeName: homeId === "0" ? "" : homeId,
    awayName: awayId === "0" ? "" : awayId,
    homeScore: 0,
    awayScore: 0,
    group: "R32",
    matchday,
    kickoff: new Date(2026, 6, 1, 12, 0),
    finished: false,
    isGroupStage: false,
    ...opts,
  };
}

const now = new Date(2026, 6, 1, 18, 0);

describe("roundOf", () => {
  it("maps matchday to knockout round", () => {
    expect(roundOf(4)).toBe("r32");
    expect(roundOf(5)).toBe("r16");
    expect(roundOf(6)).toBe("qf");
    expect(roundOf(7)).toBe("sf");
    expect(roundOf(8)).toBe("third");
    expect(roundOf(9)).toBe("final");
  });

  it("returns null for group matchdays", () => {
    expect(roundOf(1)).toBeNull();
    expect(roundOf(3)).toBeNull();
  });
});

describe("buildBracket", () => {
  it("skips group-stage games", () => {
    const groupGame = ko("1", 1, "a", "b", { isGroupStage: true });
    const b = buildBracket([groupGame], [team("a", "AAA")], now);
    expect(b.rounds.r32).toHaveLength(0);
  });

  it("buckets knockout games by round and id-orders them", () => {
    const games = [
      ko("88", 4, "0", "0"),
      ko("73", 4, "a", "b"),
      ko("89", 5, "0", "0"),
    ];
    const b = buildBracket(games, [team("a", "AAA"), team("b", "BBB")], now);
    expect(b.rounds.r32.map((m) => m.id)).toEqual(["73", "88"]);
    expect(b.rounds.r16.map((m) => m.id)).toEqual(["89"]);
  });

  it("orders each round by FIFA bracket position and splits into halves", () => {
    // Ids are FIFA match numbers. Bracket position is NOT ascending id order:
    // the top half of the draw (one finalist) is the left side, the bottom half
    // the right. Verified against the official/ESPN 2026 bracket.
    const r32 = [
      73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88,
    ].map((n) => ko(String(n), 4, "0", "0"));
    const r16 = [89, 90, 91, 92, 93, 94, 95, 96].map((n) =>
      ko(String(n), 5, "0", "0"),
    );
    const qf = [97, 98, 99, 100].map((n) => ko(String(n), 6, "0", "0"));
    const sf = [101, 102].map((n) => ko(String(n), 7, "0", "0"));
    const b = buildBracket([...r32, ...r16, ...qf, ...sf], [], now);

    // R32: adjacent pairs are the official R16 feeders, e.g. (74,77) and (73,75).
    expect(b.left[0].map((m) => m.id)).toEqual([
      "74",
      "77",
      "73",
      "75",
      "83",
      "84",
      "81",
      "82",
    ]);
    expect(b.right[0].map((m) => m.id)).toEqual([
      "76",
      "78",
      "79",
      "80",
      "86",
      "88",
      "85",
      "87",
    ]);
    // R16/QF/SF columns line up so each match centers between its two feeders.
    expect(b.left[1].map((m) => m.id)).toEqual(["89", "90", "93", "94"]);
    expect(b.right[1].map((m) => m.id)).toEqual(["91", "92", "95", "96"]);
    expect(b.left[2].map((m) => m.id)).toEqual(["97", "98"]);
    expect(b.right[2].map((m) => m.id)).toEqual(["99", "100"]);
    expect(b.left[3].map((m) => m.id)).toEqual(["101"]);
    expect(b.right[3].map((m) => m.id)).toEqual(["102"]);
  });

  it("joins real teams to flags and marks id '0' as TBD", () => {
    const game = ko("73", 4, "a", "0", {
      homeScore: 2,
      awayScore: 1,
      finished: true,
    });
    const b = buildBracket([game], [team("a", "AAA")], now);
    const m = b.rounds.r32[0];
    expect(m.home).toMatchObject({
      tbd: false,
      name: "AAA",
      code: "AAA",
      flagUrl: "flag/AAA.png",
      score: 2,
    });
    expect(m.away).toMatchObject({ tbd: true, name: "TBD" });
  });

  it("classifies status from finished/kickoff", () => {
    const finished = ko("73", 4, "a", "b", { finished: true });
    const live = ko("74", 4, "a", "b", {
      kickoff: new Date(2026, 6, 1, 17, 0),
    });
    const upcoming = ko("75", 4, "a", "b", {
      kickoff: new Date(2026, 6, 1, 20, 0),
    });
    const b = buildBracket([finished, live, upcoming], [], now);
    expect(b.rounds.r32.map((m) => m.status)).toEqual([
      "finished",
      "live",
      "upcoming",
    ]);
  });

  it("exposes the final and third-place games", () => {
    const games = [ko("104", 9, "0", "0"), ko("103", 8, "0", "0")];
    const b = buildBracket(games, [], now);
    expect(b.final?.id).toBe("104");
    expect(b.third?.id).toBe("103");
  });
});

const baseConfig: DashboardConfig = {
  groups: null,
  cols: null,
  rows: null,
  detail: "full",
  scores: true,
  upcoming: 5,
  finished: 8,
  refreshMs: 90_000,
  theme: "dark",
  highlight: [],
  fit: true,
  view: "auto",
  bracket: "full",
  bracketTimes: false,
  rotate: [],
  rotateSecs: 120,
};

function gGame(id: string, finished: boolean): Game {
  return ko(id, 1, "a", "b", { isGroupStage: true, finished });
}

describe("selectView", () => {
  const t0 = new Date(2026, 6, 1, 12, 0);

  it("honors an explicit view override", () => {
    const games = [gGame("1", false)];
    expect(selectView(games, t0, { ...baseConfig, view: "bracket" })).toBe(
      "bracket",
    );
    expect(selectView([], t0, { ...baseConfig, view: "standings" })).toBe(
      "standings",
    );
  });

  it("auto: standings while any group game is unfinished and no knockout has kicked off", () => {
    const games = [gGame("1", true), gGame("2", false), ko("73", 4, "0", "0")];
    expect(selectView(games, t0, baseConfig)).toBe("standings");
  });

  it("auto: bracket once every group game is finished", () => {
    const games = [gGame("1", true), gGame("2", true), ko("73", 4, "0", "0")];
    expect(selectView(games, t0, baseConfig)).toBe("bracket");
  });

  it("auto: bracket once now is past the earliest knockout kickoff (safety net)", () => {
    const games = [
      gGame("1", false),
      ko("73", 4, "0", "0", { kickoff: new Date(2026, 6, 1, 10, 0) }),
    ];
    expect(selectView(games, t0, baseConfig)).toBe("bracket");
  });

  it("auto: never bracket when there are no group games (empty data guard)", () => {
    expect(selectView([], t0, baseConfig)).toBe("standings");
  });

  it("auto: stays on standings when knockout games map to no round (fallback source)", () => {
    // Group stage done, but knockout games carry an unmapped matchday (0) →
    // roundOf is null → the bracket would be empty, so do not switch to it.
    const games = [
      gGame("1", true),
      gGame("2", true),
      ko("90", 0, "a", "b", { kickoff: new Date(2026, 6, 1, 10, 0) }),
    ];
    expect(selectView(games, t0, baseConfig)).toBe("standings");
  });
});

describe("activeRound", () => {
  it("returns the earliest round with an unfinished match", () => {
    const games = [
      ko("73", 4, "a", "b", { finished: true }),
      ko("74", 4, "a", "b", { finished: true }),
      ko("89", 5, "a", "b", { finished: false }),
    ];
    const b = buildBracket(games, [], new Date(2026, 6, 1, 18, 0));
    expect(activeRound(b)).toBe("r16");
  });

  it("falls back to final when every match is finished", () => {
    const games = [ko("104", 9, "a", "b", { finished: true })];
    const b = buildBracket(games, [], new Date(2026, 6, 20, 18, 0));
    expect(activeRound(b)).toBe("final");
  });

  it("headlines the final over the third-place match when both are pending", () => {
    const games = [
      ko("103", 8, "a", "b"), // third place, upcoming
      ko("104", 9, "c", "d"), // final, upcoming
    ];
    const b = buildBracket(games, [], new Date(2026, 6, 1, 18, 0));
    expect(activeRound(b)).toBe("final");
  });
});

describe("bracketHasMatches", () => {
  it("is false when there are no knockout games, true otherwise", () => {
    const groupOnly = [ko("1", 1, "a", "b", { isGroupStage: true })];
    expect(bracketHasMatches(buildBracket(groupOnly, [], now))).toBe(false);
    expect(bracketHasMatches(buildBracket([], [], now))).toBe(false);
    expect(
      bracketHasMatches(buildBracket([ko("73", 4, "a", "b")], [], now)),
    ).toBe(true);
  });
});
