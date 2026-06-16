import type { Source, SourceSnapshot } from "./sources/source";
import { withTimeout } from "./timeout";

export interface FailoverResult extends SourceSnapshot {
  source: string;
}

// Tries each source in order, with a per-attempt timeout. Returns the first
// successful snapshot tagged with its source name, or null if all fail.
export async function fetchSnapshotWithFailover(
  sources: Source[],
  timeoutMs: number,
): Promise<FailoverResult | null> {
  for (const src of sources) {
    try {
      const snap = await withTimeout(src.fetchSnapshot(), timeoutMs);
      return { ...snap, source: src.name };
    } catch (err) {
      console.error(`source "${src.name}" failed:`, err);
    }
  }
  return null;
}
