import { describe, it, expect } from "vitest";
import { handleRequest } from "./handler";
import type { KVStore, KvRecord } from "./refresh";
import type { Source, SourceSnapshot } from "./sources/source";

const ORIGIN = "https://worldcupdak.onrender.com";

function fakeKV(
  seed?: Record<string, KvRecord>,
): KVStore & { store: Map<string, string> } {
  const store = new Map<string, string>();
  for (const [k, v] of Object.entries(seed ?? {}))
    store.set(k, JSON.stringify(v));
  return {
    store,
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => void store.set(k, v),
  };
}

const SNAP: SourceSnapshot = {
  teams: [{ id: "1", name: "Mexico", code: "MEX", flagUrl: "f", group: "A" }],
  games: [],
};
const okSource: Source = { name: "primary", fetchSnapshot: async () => SNAP };
const downSource: Source = {
  name: "primary",
  fetchSnapshot: async () => {
    throw new Error("down");
  },
};

function deps(kv: KVStore, sources: Source[]) {
  return { kv, sources, now: () => 1000 };
}

describe("handleRequest", () => {
  it("serves teams from KV with CORS + source headers", async () => {
    const kv = fakeKV({
      teams: {
        data: SNAP.teams,
        source: "primary",
        fetchedAt: 1000,
        hash: "abc",
      },
    });
    const res = await handleRequest(
      new Request(`${ORIGIN}/get/teams`),
      deps(kv, [okSource]),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("X-Data-Source")).toBe("primary");
    expect(await res.json()).toEqual(SNAP.teams);
  });

  it("answers an OPTIONS preflight with 204 + CORS", async () => {
    const res = await handleRequest(
      new Request(`${ORIGIN}/get/teams`, { method: "OPTIONS" }),
      deps(fakeKV(), [okSource]),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  });

  it("404s an unknown path", async () => {
    const res = await handleRequest(
      new Request(`${ORIGIN}/nope`),
      deps(fakeKV(), [okSource]),
    );
    expect(res.status).toBe(404);
  });

  it("populates cold KV inline, then serves the requested key", async () => {
    const kv = fakeKV(); // empty
    const res = await handleRequest(
      new Request(`${ORIGIN}/get/teams`),
      deps(kv, [okSource]),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SNAP.teams);
    expect(kv.store.has("games")).toBe(true); // both keys written during populate
  });

  it("503s when KV is cold and all sources fail", async () => {
    const res = await handleRequest(
      new Request(`${ORIGIN}/get/games`),
      deps(fakeKV(), [downSource]),
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  });
});
