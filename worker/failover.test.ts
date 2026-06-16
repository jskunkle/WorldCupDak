import { describe, it, expect } from "vitest";
import { fetchSnapshotWithFailover } from "./failover";
import type { Source, SourceSnapshot } from "./sources/source";

const SNAP: SourceSnapshot = { teams: [], games: [] };

function ok(name: string): Source {
  return { name, fetchSnapshot: async () => SNAP };
}
function fail(name: string): Source {
  return {
    name,
    fetchSnapshot: async () => {
      throw new Error(`${name} down`);
    },
  };
}

describe("fetchSnapshotWithFailover", () => {
  it("returns the first source's snapshot tagged with its name", async () => {
    const result = await fetchSnapshotWithFailover(
      [ok("primary"), ok("fallback")],
      1000,
    );
    expect(result).toEqual({ ...SNAP, source: "primary" });
  });

  it("falls back to the next source when the primary throws", async () => {
    const result = await fetchSnapshotWithFailover(
      [fail("primary"), ok("fallback")],
      1000,
    );
    expect(result).toEqual({ ...SNAP, source: "fallback" });
  });

  it("returns null when every source fails", async () => {
    const result = await fetchSnapshotWithFailover(
      [fail("primary"), fail("fallback")],
      1000,
    );
    expect(result).toBeNull();
  });
});
