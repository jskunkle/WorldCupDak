import type { Source } from "./sources/source";
import { fetchSnapshotWithFailover } from "./failover";
import { hashString } from "./hash";

export interface KVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface KvRecord {
  data: unknown;
  source: string;
  fetchedAt: number;
  hash: string;
}

const TIMEOUT_MS = 25_000;

async function writeIfChanged(
  kv: KVStore,
  key: string,
  data: unknown,
  source: string,
  now: number,
): Promise<boolean> {
  const hash = hashString(JSON.stringify(data));
  const existingRaw = await kv.get(key);
  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw) as KvRecord;
      if (existing.hash === hash) return false;
    } catch {
      // Unparseable existing record — fall through and overwrite.
    }
  }
  const record: KvRecord = { data, source, fetchedAt: now, hash };
  await kv.put(key, JSON.stringify(record));
  return true;
}

export interface RefreshResult {
  source: string;
  teamsWritten: boolean;
  gamesWritten: boolean;
}

// Fetches one full snapshot via failover and writes the teams/games KV records
// only when their content changed. Returns null if every source failed.
export async function refreshSnapshot(
  sources: Source[],
  kv: KVStore,
  now: number,
): Promise<RefreshResult | null> {
  const snap = await fetchSnapshotWithFailover(sources, TIMEOUT_MS);
  if (!snap) return null;
  const teamsWritten = await writeIfChanged(kv, "teams", snap.teams, snap.source, now);
  const gamesWritten = await writeIfChanged(kv, "games", snap.games, snap.source, now);
  return { source: snap.source, teamsWritten, gamesWritten };
}
