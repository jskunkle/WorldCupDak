import { describe, it, expect, beforeEach } from "vitest";
import { renderStandings, renderScoreFeed } from "../src/render";
import type { GroupTable, FeedMatch } from "../src/types";

function makeGroups(): GroupTable[] {
  return ["A", "B"].map((group) => ({
    group,
    rows: [1, 2, 3, 4].map((n) => ({
      rank: n,
      teamId: `${group}${n}`,
      code: `T${n}`,
      name: `Team ${n}`,
      flagUrl: `flag/${group}${n}.png`,
      gp: 1,
      w: 1,
      d: 0,
      l: 0,
      gf: 2,
      ga: 0,
      gd: 2,
      pts: 3,
    })),
  }));
}

describe("renderStandings", () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement("div");
  });

  it("renders one table per group with a labelled header", () => {
    renderStandings(container, makeGroups());
    expect(container.querySelectorAll("[data-group]")).toHaveLength(2);
    expect(container.querySelector('[data-group="A"]')?.textContent).toContain(
      "Group A",
    );
  });

  it("renders a row per team tagged with the team code", () => {
    renderStandings(container, makeGroups());
    const a = container.querySelector('[data-group="A"]')!;
    expect(a.querySelectorAll("[data-team]")).toHaveLength(4);
    expect(a.querySelector('[data-team="T1"]')?.textContent).toContain("3"); // points
  });

  it("marks the top two rows as advancing", () => {
    renderStandings(container, makeGroups());
    const a = container.querySelector('[data-group="A"]')!;
    const advancing = a.querySelectorAll(".advancing");
    expect(advancing).toHaveLength(2);
  });

  it("updates in place without leaving stale tables", () => {
    renderStandings(container, makeGroups());
    renderStandings(container, makeGroups());
    expect(container.querySelectorAll("[data-group]")).toHaveLength(2);
  });
});

describe("renderScoreFeed", () => {
  it("renders each match with score and a kind class", () => {
    const container = document.createElement("div");
    const feed: FeedMatch[] = [
      {
        id: "1",
        kind: "live",
        homeName: "USA",
        awayName: "PAR",
        homeScore: 4,
        awayScore: 1,
        kickoff: new Date(2026, 5, 14, 17, 0),
      },
    ];
    renderScoreFeed(container, feed);
    const m = container.querySelector('[data-match="1"]')!;
    expect(m.classList.contains("live")).toBe(true);
    expect(m.textContent).toContain("USA");
    expect(m.textContent).toContain("4");
    expect(m.textContent).toContain("1");
  });
});
