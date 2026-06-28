import { describe, it, expect } from "vitest";
import { resolveAdvancement } from "../src/advance";
import type { Game } from "../src/types";

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
    kickoff: new Date(2026, 5, 28, 12, 0),
    finished: false,
    isGroupStage: false,
    ...opts,
  };
}

describe("resolveAdvancement", () => {
  it("advances the winner of a finished match into the labeled next-round slot", () => {
    // Game 73: South Africa 0 - Canada 1 (away wins). Feeds the home slot of 90.
    const r32 = ko("73", 4, "saf", "can", {
      homeName: "South Africa",
      awayName: "Canada",
      homeScore: 0,
      awayScore: 1,
      finished: true,
    });
    const r16 = ko("90", 5, "0", "0", {
      homeLabel: "Winner Match 73",
      awayLabel: "Winner Match 75",
    });

    const out = resolveAdvancement([r32, r16]);
    const m90 = out.find((g) => g.id === "90")!;
    expect(m90.homeId).toBe("can");
    expect(m90.homeName).toBe("Canada");
    // Match 75 hasn't finished, so the away slot stays a placeholder.
    expect(m90.awayId).toBe("0");
  });

  it("advances the home team when the home side wins", () => {
    const r32 = ko("74", 4, "ger", "par", {
      homeScore: 2,
      awayScore: 1,
      finished: true,
    });
    const r16 = ko("89", 5, "0", "0", { homeLabel: "Winner Match 74" });
    const out = resolveAdvancement([r32, r16]);
    expect(out.find((g) => g.id === "89")!.homeId).toBe("ger");
  });

  it("leaves the slot TBD for a finished match that ended level (shootout — no data)", () => {
    const r32 = ko("73", 4, "saf", "can", {
      homeScore: 1,
      awayScore: 1,
      finished: true,
    });
    const r16 = ko("90", 5, "0", "0", { homeLabel: "Winner Match 73" });
    const out = resolveAdvancement([r32, r16]);
    expect(out.find((g) => g.id === "90")!.homeId).toBe("0");
  });

  it("leaves the slot TBD while the feeder match is unfinished", () => {
    const r32 = ko("73", 4, "saf", "can", { homeScore: 0, awayScore: 1 });
    const r16 = ko("90", 5, "0", "0", { homeLabel: "Winner Match 73" });
    const out = resolveAdvancement([r32, r16]);
    expect(out.find((g) => g.id === "90")!.homeId).toBe("0");
  });

  it("routes the loser of a semifinal into the third-place match", () => {
    const sf = ko("101", 7, "fra", "bra", {
      matchday: 7,
      homeScore: 0,
      awayScore: 2,
      finished: true,
    });
    const third = ko("103", 8, "0", "0", {
      matchday: 8,
      homeLabel: "Loser Match 101",
    });
    const out = resolveAdvancement([sf, third]);
    expect(out.find((g) => g.id === "103")!.homeId).toBe("fra");
  });

  it("cascades across rounds (R16 results fill the QF)", () => {
    const m89 = ko("89", 5, "a", "b", {
      matchday: 5,
      homeScore: 3,
      awayScore: 0,
      finished: true,
    });
    const m90 = ko("90", 5, "c", "d", {
      matchday: 5,
      homeScore: 0,
      awayScore: 1,
      finished: true,
    });
    const qf = ko("97", 6, "0", "0", {
      matchday: 6,
      homeLabel: "Winner Match 89",
      awayLabel: "Winner Match 90",
    });
    const out = resolveAdvancement([qf, m89, m90]);
    const m97 = out.find((g) => g.id === "97")!;
    expect(m97.homeId).toBe("a");
    expect(m97.awayId).toBe("d");
  });

  it("never overwrites a slot the source already filled with a real team", () => {
    const r32 = ko("73", 4, "saf", "can", {
      homeScore: 0,
      awayScore: 1,
      finished: true,
    });
    const r16 = ko("90", 5, "mex", "0", {
      homeName: "Mexico",
      homeLabel: "Winner Match 73",
    });
    const out = resolveAdvancement([r32, r16]);
    expect(out.find((g) => g.id === "90")!.homeId).toBe("mex");
  });

  it("ignores labels that don't reference a match (e.g. group qualifiers)", () => {
    const r32 = ko("73", 4, "0", "0", {
      homeLabel: "Runner-up Group A",
      awayLabel: "Runner-up Group B",
    });
    const out = resolveAdvancement([r32]);
    const m = out.find((g) => g.id === "73")!;
    expect(m.homeId).toBe("0");
    expect(m.awayId).toBe("0");
  });

  it("does not mutate the input games", () => {
    const r32 = ko("73", 4, "saf", "can", {
      homeScore: 0,
      awayScore: 1,
      finished: true,
    });
    const r16 = ko("90", 5, "0", "0", { homeLabel: "Winner Match 73" });
    resolveAdvancement([r32, r16]);
    expect(r16.homeId).toBe("0");
  });
});
