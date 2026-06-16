import type { Source } from "./sources/source";
import { refreshSnapshot, type KVStore, type KvRecord } from "./refresh";

const ALLOWED_ORIGIN = "https://worldcupdak.onrender.com";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const KEY_BY_PATH: Record<string, "teams" | "games"> = {
  "/get/teams": "teams",
  "/get/games": "games",
};

export interface HandlerDeps {
  kv: KVStore;
  sources: Source[];
  now: () => number;
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export async function handleRequest(
  request: Request,
  deps: HandlerDeps,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const key = KEY_BY_PATH[new URL(request.url).pathname];
  if (!key) return new Response("Not found", { status: 404, headers: CORS });

  let raw = await deps.kv.get(key);
  if (raw === null) {
    // Cold KV (before the first cron tick): populate inline, then re-read.
    const result = await refreshSnapshot(deps.sources, deps.kv, deps.now());
    if (result === null) return jsonError(503, "no data available");
    raw = await deps.kv.get(key);
  }
  if (raw === null) return jsonError(503, "no data available");

  const record = JSON.parse(raw) as KvRecord;
  return new Response(JSON.stringify(record.data), {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=30",
      "X-Data-Source": record.source,
      "X-Fetched-At": String(record.fetchedAt),
    },
  });
}
