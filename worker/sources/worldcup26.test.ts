import { describe, it, expect } from "vitest";
import { normalizeTeams, normalizeGames } from "./worldcup26";
import type { RawTeam, RawGame } from "../../src/types";

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
    expect(normalizeTeams([rawTeam])[0]).toEqual({
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
    expect(g.kickoff.getMonth()).toBe(5);
    expect(g.kickoff.getDate()).toBe(11);
  });

  it("treats finished other than 'TRUE' as not finished", () => {
    expect(
      normalizeGames([{ ...finishedGame, finished: "FALSE" }])[0].finished,
    ).toBe(false);
  });

  it("marks non-group types as not group stage", () => {
    expect(
      normalizeGames([{ ...finishedGame, type: "round_of_32" }])[0]
        .isGroupStage,
    ).toBe(false);
  });

  it("coerces malformed numeric fields to 0 instead of NaN", () => {
    const [g] = normalizeGames([
      { ...finishedGame, home_score: "null", away_score: "" },
    ]);
    expect(g.homeScore).toBe(0);
    expect(g.awayScore).toBe(0);
  });
});
