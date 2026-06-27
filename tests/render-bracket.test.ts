import { describe, it, expect } from "vitest";
import { renderFullBracket } from "../src/render-bracket";
import { buildBracket } from "../src/bracket";
import type { Team, Game } from "../src/types";

function team(id: string, code: string): Team {
  return { id, code, name: code, flagUrl: `flag/${code}.png`, group: "A" };
}
function ko(
  id: string,
  matchday: number,
  h: string,
  a: string,
  o: Partial<Game> = {},
): Game {
  return {
    id,
    homeId: h,
    awayId: a,
    homeName: h === "0" ? "" : h,
    awayName: a === "0" ? "" : a,
    homeScore: 0,
    awayScore: 0,
    group: "R",
    matchday,
    kickoff: new Date(2026, 6, 1, 12, 0),
    finished: false,
    isGroupStage: false,
    ...o,
  };
}

// A minimal but full-shaped bracket: 2 R32, 0 of the rest, no final.
function sampleBracket() {
  const games = [
    ko("73", 4, "a", "0", { homeScore: 2, awayScore: 1, finished: true }),
    ko("74", 4, "0", "0", { kickoff: new Date(2026, 6, 1, 17, 0) }),
  ];
  return buildBracket(games, [team("a", "BRA")], new Date(2026, 6, 1, 18, 0));
}

describe("renderFullBracket", () => {
  it("renders a column per round with a data-round attribute", () => {
    const c = document.createElement("div");
    renderFullBracket(c, sampleBracket());
    expect(c.querySelector('[data-round="r32"]')).toBeTruthy();
  });

  it("renders a match tagged by id with both teams", () => {
    const c = document.createElement("div");
    renderFullBracket(c, sampleBracket());
    const m = c.querySelector('[data-match="73"]')!;
    expect(m).toBeTruthy();
    expect(m.querySelector('[data-team="BRA"]')).toBeTruthy();
    expect(m.textContent).toContain("BRA");
  });

  it("renders TBD for unresolved slots", () => {
    const c = document.createElement("div");
    renderFullBracket(c, sampleBracket());
    const m = c.querySelector('[data-match="73"]')!;
    expect(m.textContent).toContain("TBD"); // away side
  });

  it("shows scores for finished matches and marks live ones", () => {
    const c = document.createElement("div");
    renderFullBracket(c, sampleBracket());
    expect(c.querySelector('[data-match="73"]')!.textContent).toContain("2");
    expect(
      c.querySelector('[data-match="74"]')!.classList.contains("live"),
    ).toBe(true);
  });

  it("falls back to a placeholder when a flag image fails", () => {
    const c = document.createElement("div");
    renderFullBracket(c, sampleBracket());
    const img = c.querySelector(
      '[data-match="73"] img.bm-flag',
    ) as HTMLImageElement;
    expect(img).toBeTruthy();
    img.dispatchEvent(new Event("error"));
    expect(c.querySelector('[data-match="73"] .bm-flagph')).toBeTruthy();
  });

  it("repaints in place without stacking columns", () => {
    const c = document.createElement("div");
    renderFullBracket(c, sampleBracket());
    renderFullBracket(c, sampleBracket());
    expect(c.querySelectorAll('[data-round="r32"]')).toHaveLength(2); // one per side
  });
});
