import { handleRequest } from "./handler";
import { refreshSnapshot, type KVStore } from "./refresh";
import { worldcup26Source } from "./sources/worldcup26";
import { createFootballDataSource } from "./sources/football-data";
import type { Source } from "./sources/source";

export interface Env {
  WCDAK_KV: KVNamespace;
  FOOTBALL_DATA_TOKEN: string;
}

// worldcup26.ir primary, football-data.org fallback (same order = same id space
// per refresh; see spec §3).
function sourcesFor(env: Env): Source[] {
  return [worldcup26Source, createFootballDataSource(env.FOOTBALL_DATA_TOKEN)];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, {
      kv: env.WCDAK_KV as unknown as KVStore,
      sources: sourcesFor(env),
      now: () => Date.now(),
    });
  },

  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      refreshSnapshot(
        sourcesFor(env),
        env.WCDAK_KV as unknown as KVStore,
        Date.now(),
      ).then(() => undefined),
    );
  },
};
