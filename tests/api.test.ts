import { describe, it, expect } from "vitest";
import { fetchTeams, fetchGames } from "../src/api";
import type { Team } from "../src/types";

const team: Team = {
  id: "1",
  name: "Mexico",
  code: "MEX",
  flagUrl: "https://flagcdn.com/w80/mx.png",
  group: "A",
};

// Worker serializes Game.kickoff (a Date) to an ISO string over the wire.
const wireGame = {
  id: "1",
  homeId: "1",
  awayId: "2",
  homeName: "Mexico",
  awayName: "South Africa",
  homeScore: 2,
  awayScore: 0,
  group: "A",
  matchday: 1,
  kickoff: "2026-06-11T19:00:00.000Z",
  finished: true,
  isGroupStage: true,
};

function fakeResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe("fetchTeams", () => {
  it("fetches /get/teams and returns the teams array", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(url);
      return fakeResponse([team]);
    }) as unknown as typeof fetch;

    const teams = await fetchTeams(fakeFetch);
    expect(calls[0]).toContain("/get/teams");
    expect(teams[0].code).toBe("MEX");
  });

  it("throws when the response is not ok", async () => {
    const fakeFetch = (async () =>
      fakeResponse([], false, 500)) as unknown as typeof fetch;
    await expect(fetchTeams(fakeFetch)).rejects.toThrow();
  });
});

describe("fetchGames", () => {
  it("fetches /get/games and revives kickoff into a Date", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(url);
      return fakeResponse([wireGame]);
    }) as unknown as typeof fetch;

    const [g] = await fetchGames(fakeFetch);
    expect(calls[0]).toContain("/get/games");
    expect(g.kickoff).toBeInstanceOf(Date);
    expect(g.kickoff.getUTCFullYear()).toBe(2026);
    expect(g.homeScore).toBe(2);
  });

  it("throws when the response is not ok", async () => {
    const fakeFetch = (async () =>
      fakeResponse([], false, 500)) as unknown as typeof fetch;
    await expect(fetchGames(fakeFetch)).rejects.toThrow();
  });
});
