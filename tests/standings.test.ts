import { describe, it, expect } from "vitest";
import { computeStandings, buildScoreFeed } from "../src/standings";
import type { Team, Game } from "../src/types";

function team(id: string, code: string, group = "A"): Team {
  return { id, code, name: code, flagUrl: `flag/${code}`, group };
}

function game(
  homeId: string,
  awayId: string,
  homeScore: number,
  awayScore: number,
  opts: Partial<Game> = {},
): Game {
  return {
    id: `${homeId}-${awayId}`,
    homeId,
    awayId,
    homeName: homeId,
    awayName: awayId,
    homeScore,
    awayScore,
    group: "A",
    matchday: 1,
    kickoff: new Date(2026, 5, 11, 12, 0),
    finished: true,
    isGroupStage: true,
    ...opts,
  };
}

const groupA = [
  team("1", "MEX"),
  team("2", "RSA"),
  team("3", "KOR"),
  team("4", "CZE"),
];

describe("computeStandings", () => {
  it("returns every team at 0-0-0 before any match", () => {
    const [g] = computeStandings(groupA, []);
    expect(g.group).toBe("A");
    expect(g.rows).toHaveLength(4);
    expect(g.rows.every((r) => r.gp === 0 && r.pts === 0)).toBe(true);
  });

  it("scores a win (3), loss (0) and tracks GF/GA/GD", () => {
    const [g] = computeStandings(groupA, [game("1", "2", 2, 0)]);
    const mex = g.rows.find((r) => r.code === "MEX")!;
    const rsa = g.rows.find((r) => r.code === "RSA")!;
    expect(mex).toMatchObject({
      gp: 1,
      w: 1,
      d: 0,
      l: 0,
      gf: 2,
      ga: 0,
      gd: 2,
      pts: 3,
    });
    expect(rsa).toMatchObject({
      gp: 1,
      w: 0,
      d: 0,
      l: 1,
      gf: 0,
      ga: 2,
      gd: -2,
      pts: 0,
    });
  });

  it("scores a draw as 1 point each", () => {
    const [g] = computeStandings(groupA, [game("3", "4", 1, 1)]);
    const kor = g.rows.find((r) => r.code === "KOR")!;
    expect(kor).toMatchObject({ gp: 1, w: 0, d: 1, l: 0, pts: 1 });
  });

  it("sorts by Pts then GD then GF and assigns rank", () => {
    // MEX 3-0 RSA, KOR 1-0 CZE → MEX & KOR both 3pts, MEX better GD.
    const g = computeStandings(groupA, [
      game("1", "2", 3, 0),
      game("3", "4", 1, 0),
    ])[0];
    expect(g.rows.map((r) => r.code)).toEqual(["MEX", "KOR", "CZE", "RSA"]);
    expect(g.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it("ignores unfinished and non-group matches", () => {
    const games = [
      game("1", "2", 5, 0, { finished: false }),
      game("1", "2", 5, 0, { isGroupStage: false }),
    ];
    const [g] = computeStandings(groupA, games);
    expect(g.rows.every((r) => r.gp === 0)).toBe(true);
  });

  it("returns groups ordered A..L", () => {
    const teams = [team("9", "ENG", "L"), team("1", "MEX", "A")];
    const groups = computeStandings(teams, []);
    expect(groups.map((g) => g.group)).toEqual(["A", "L"]);
  });
});

describe("buildScoreFeed", () => {
  const now = new Date(2026, 5, 14, 18, 0); // June 14 2026, 18:00

  function fg(id: string, opts: Partial<Game>): Game {
    return {
      id,
      homeId: "h",
      awayId: "a",
      homeName: "Home",
      awayName: "Away",
      homeScore: 0,
      awayScore: 0,
      group: "A",
      matchday: 1,
      kickoff: new Date(2026, 5, 14, 12, 0),
      finished: false,
      isGroupStage: true,
      ...opts,
    };
  }

  it("classifies started-but-unfinished matches as live", () => {
    const feed = buildScoreFeed(
      [fg("1", { kickoff: new Date(2026, 5, 14, 17, 0) })],
      now,
    );
    expect(feed[0].kind).toBe("live");
  });

  it("classifies finished matches as finished", () => {
    const feed = buildScoreFeed([fg("1", { finished: true })], now);
    expect(feed[0].kind).toBe("finished");
  });

  it("classifies future matches as upcoming", () => {
    const feed = buildScoreFeed(
      [fg("1", { kickoff: new Date(2026, 5, 14, 21, 0) })],
      now,
    );
    expect(feed[0].kind).toBe("upcoming");
  });

  it("orders live first, then finished, then upcoming", () => {
    const feed = buildScoreFeed(
      [
        fg("up", { kickoff: new Date(2026, 5, 14, 21, 0) }),
        fg("fin", { finished: true }),
        fg("live", { kickoff: new Date(2026, 5, 14, 17, 0) }),
      ],
      now,
    );
    expect(feed.map((m) => m.kind)).toEqual(["live", "finished", "upcoming"]);
  });

  it("limits upcoming matches to the next 5", () => {
    const upcoming = Array.from({ length: 9 }, (_, i) =>
      fg(`u${i}`, { kickoff: new Date(2026, 5, 15, 12 + i, 0) }),
    );
    const feed = buildScoreFeed(upcoming, now);
    expect(feed.filter((m) => m.kind === "upcoming")).toHaveLength(5);
  });
});
