import { describe, it, expect } from "vitest";
import { refreshSnapshot } from "./refresh";
import type { KVStore } from "./refresh";
import type { Source, SourceSnapshot } from "./sources/source";
import type { Team, Game } from "../src/types";

function fakeKV(): KVStore & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => void store.set(k, v),
  };
}

const team: Team = { id: "1", name: "Mexico", code: "MEX", flagUrl: "f", group: "A" };
const game: Game = {
  id: "1", homeId: "1", awayId: "2", homeName: "Mexico", awayName: "RSA",
  homeScore: 0, awayScore: 0, group: "A", matchday: 1,
  kickoff: new Date("2026-06-11T19:00:00Z"), finished: false, isGroupStage: true,
};
const SNAP: SourceSnapshot = { teams: [team], games: [game] };

function source(name: string, snap: SourceSnapshot | null): Source {
  return {
    name,
    fetchSnapshot: async () => {
      if (snap === null) throw new Error(`${name} down`);
      return snap;
    },
  };
}

describe("refreshSnapshot", () => {
  it("writes both keys on first run and reports the source", async () => {
    const kv = fakeKV();
    const result = await refreshSnapshot([source("primary", SNAP)], kv, 1000);
    expect(result).toEqual({ source: "primary", teamsWritten: true, gamesWritten: true });
    expect(JSON.parse(kv.store.get("teams")!).source).toBe("primary");
    expect(JSON.parse(kv.store.get("games")!).data[0].id).toBe("1");
  });

  it("does not rewrite a key whose content is unchanged", async () => {
    const kv = fakeKV();
    await refreshSnapshot([source("primary", SNAP)], kv, 1000);
    const result = await refreshSnapshot([source("primary", SNAP)], kv, 2000);
    expect(result).toEqual({ source: "primary", teamsWritten: false, gamesWritten: false });
  });

  it("rewrites games when a score changes but leaves unchanged teams alone", async () => {
    const kv = fakeKV();
    await refreshSnapshot([source("primary", SNAP)], kv, 1000);
    const changed: SourceSnapshot = { teams: [team], games: [{ ...game, homeScore: 1 }] };
    const result = await refreshSnapshot([source("primary", changed)], kv, 2000);
    expect(result).toEqual({ source: "primary", teamsWritten: false, gamesWritten: true });
  });

  it("falls back to the second source when the primary fails", async () => {
    const kv = fakeKV();
    const result = await refreshSnapshot(
      [source("primary", null), source("fallback", SNAP)], kv, 1000,
    );
    expect(result?.source).toBe("fallback");
  });

  it("returns null and writes nothing when all sources fail", async () => {
    const kv = fakeKV();
    const result = await refreshSnapshot([source("primary", null)], kv, 1000);
    expect(result).toBeNull();
    expect(kv.store.size).toBe(0);
  });
});
