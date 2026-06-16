import { describe, it, expect } from "vitest";
import { normalizeFdGames, normalizeFdTeams } from "./football-data";

const matchesRes = {
  matches: [
    {
      id: 537327,
      utcDate: "2026-06-11T19:00:00Z",
      status: "FINISHED",
      matchday: 1,
      stage: "GROUP_STAGE",
      group: "GROUP_A",
      homeTeam: { id: 769, name: "Mexico" },
      awayTeam: { id: 774, name: "South Africa" },
      score: { fullTime: { home: 2, away: 0 } },
    },
    {
      id: 537400,
      utcDate: "2026-07-10T19:00:00Z",
      status: "SCHEDULED",
      matchday: 7,
      stage: "SEMI_FINALS",
      group: null,
      homeTeam: { id: 769, name: "Mexico" },
      awayTeam: { id: 758, name: "Uruguay" },
      score: { fullTime: { home: null, away: null } },
    },
  ],
};

const teamsRes = {
  teams: [
    {
      id: 769,
      name: "Mexico",
      tla: "MEX",
      crest: "https://crests.football-data.org/769.svg",
    },
    {
      id: 758,
      name: "Uruguay",
      tla: "URU",
      crest: "https://crests.football-data.org/758.svg",
    },
  ],
};

describe("normalizeFdGames", () => {
  it("maps a finished group match to the domain Game", () => {
    const [g] = normalizeFdGames(matchesRes);
    expect(g).toEqual({
      id: "537327",
      homeId: "769",
      awayId: "774",
      homeName: "Mexico",
      awayName: "South Africa",
      homeScore: 2,
      awayScore: 0,
      group: "A",
      matchday: 1,
      kickoff: new Date("2026-06-11T19:00:00Z"),
      finished: true,
      isGroupStage: true,
    });
  });

  it("uses 0 for null scores and '' group for knockout, and flags non-group stage", () => {
    const g = normalizeFdGames(matchesRes)[1];
    expect(g.homeScore).toBe(0);
    expect(g.awayScore).toBe(0);
    expect(g.group).toBe("");
    expect(g.finished).toBe(false);
    expect(g.isGroupStage).toBe(false);
  });
});

describe("normalizeFdTeams", () => {
  it("maps team fields and derives group from matches", () => {
    const teams = normalizeFdTeams(teamsRes, matchesRes);
    expect(teams[0]).toEqual({
      id: "769",
      name: "Mexico",
      code: "MEX",
      flagUrl: "https://crests.football-data.org/769.svg",
      group: "A",
    });
  });

  it("leaves group empty for a team with no group-stage match", () => {
    // Uruguay only appears in the knockout match above.
    expect(normalizeFdTeams(teamsRes, matchesRes)[1].group).toBe("");
  });
});

describe("normalizeFdGames isGroupStage derivation", () => {
  it("marks group-stage from a populated group, not the stage literal", () => {
    // A populated group with an unexpected stage label must still be group-stage.
    const res = {
      matches: [
        {
          id: 1,
          utcDate: "2026-06-12T16:00:00Z",
          status: "SCHEDULED",
          matchday: 2,
          stage: "LEAGUE_STAGE",
          group: "GROUP_C",
          homeTeam: { id: 800, name: "A" },
          awayTeam: { id: 801, name: "B" },
          score: { fullTime: { home: null, away: null } },
        },
      ],
    };
    expect(normalizeFdGames(res)[0].isGroupStage).toBe(true);
    expect(normalizeFdGames(res)[0].group).toBe("C");
  });
});
