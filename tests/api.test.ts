import { describe, it, expect } from "vitest";
import { normalizeTeams, normalizeGames, fetchTeams, fetchGames } from "../src/api";
import type { RawTeam, RawGame } from "../src/types";

const rawTeam: RawTeam = {
  id: "1",
  name_en: "Mexico",
  flag: "https://flagcdn.com/w80/mx.png",
  fifa_code: "MEX",
  iso2: "MX",
  groups: "A",
};

const finishedGame: RawGame = {
  id: "1",
  home_team_id: "1",
  away_team_id: "2",
  home_score: "2",
  away_score: "0",
  group: "A",
  matchday: "1",
  local_date: "06/11/2026 13:00",
  finished: "TRUE",
  time_elapsed: "finished",
  type: "group",
  home_team_name_en: "Mexico",
  away_team_name_en: "South Africa",
};

describe("normalizeTeams", () => {
  it("maps raw fields to the domain Team", () => {
    const [t] = normalizeTeams([rawTeam]);
    expect(t).toEqual({
      id: "1",
      name: "Mexico",
      code: "MEX",
      flagUrl: "https://flagcdn.com/w80/mx.png",
      group: "A",
    });
  });
});

describe("normalizeGames", () => {
  it("coerces strings to numbers/booleans and parses the date", () => {
    const [g] = normalizeGames([finishedGame]);
    expect(g.homeScore).toBe(2);
    expect(g.awayScore).toBe(0);
    expect(g.finished).toBe(true);
    expect(g.isGroupStage).toBe(true);
    expect(g.matchday).toBe(1);
    expect(g.kickoff.getFullYear()).toBe(2026);
    expect(g.kickoff.getMonth()).toBe(5); // June (0-based)
    expect(g.kickoff.getDate()).toBe(11);
  });

  it("treats finished other than 'TRUE' as not finished", () => {
    const [g] = normalizeGames([{ ...finishedGame, finished: "FALSE" }]);
    expect(g.finished).toBe(false);
  });

  it("marks non-group types as not group stage", () => {
    const [g] = normalizeGames([{ ...finishedGame, type: "round_of_32" }]);
    expect(g.isGroupStage).toBe(false);
  });

  it("coerces malformed numeric fields to 0 instead of NaN", () => {
    const [g] = normalizeGames([
      { ...finishedGame, home_score: "null", away_score: "" },
    ]);
    expect(g.homeScore).toBe(0);
    expect(g.awayScore).toBe(0);
  });
});

function fakeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("fetchTeams", () => {
  it("fetches the teams endpoint and returns normalized teams", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(url);
      return fakeResponse({ teams: [rawTeam] });
    }) as unknown as typeof fetch;

    const teams = await fetchTeams(fakeFetch);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/get/teams");
    expect(teams[0].code).toBe("MEX");
  });

  it("throws when the response is not ok", async () => {
    const fakeFetch = (async () =>
      fakeResponse({ teams: [] }, false, 500)) as unknown as typeof fetch;
    await expect(fetchTeams(fakeFetch)).rejects.toThrow();
  });
});

describe("fetchGames", () => {
  it("fetches the games endpoint and returns normalized games", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(url);
      return fakeResponse({ games: [finishedGame] });
    }) as unknown as typeof fetch;

    const games = await fetchGames(fakeFetch);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/get/games");
    expect(games[0].homeScore).toBe(2);
  });

  it("throws when the response is not ok", async () => {
    const fakeFetch = (async () =>
      fakeResponse({ games: [] }, false, 500)) as unknown as typeof fetch;
    await expect(fetchGames(fakeFetch)).rejects.toThrow();
  });
});
