export interface DashboardConfig {
  groups: string[] | null; // null = show all groups
  cols: number | null; // null = derive from group count
  rows: number | null; // null = derive from group count
  detail: "compact" | "full";
  scores: boolean;
  upcoming: number;
  finished: number;
  refreshMs: number;
  theme: "dark" | "light";
  highlight: string[]; // FIFA codes, uppercased
  fit: boolean;
}

const DEFAULTS: DashboardConfig = {
  groups: null,
  cols: null,
  rows: null,
  detail: "full",
  scores: true,
  upcoming: 5,
  finished: 8,
  refreshMs: 90_000,
  theme: "dark",
  highlight: [],
  fit: true,
};

const MIN_REFRESH_MS = 30_000;

function positiveInt(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function nonNegativeInt(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function csvCodes(raw: string | null): string[] {
  if (raw === null) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
}

export function parseConfig(search: string): DashboardConfig {
  const p = new URLSearchParams(search);

  // World Cup 2026 has 12 groups: A–L.
  const groupLetters = csvCodes(p.get("groups")).filter((s) =>
    /^[A-L]$/.test(s),
  );
  const groups = [...new Set(groupLetters)];

  // Handled inline (not via the int helpers) because refresh needs
  // seconds-to-ms conversion plus a floor clamp to MIN_REFRESH_MS.
  const refreshRaw = p.get("refresh");
  const refreshSec =
    refreshRaw === null ? null : Number.parseInt(refreshRaw, 10);
  const refreshMs =
    refreshSec !== null && Number.isInteger(refreshSec)
      ? Math.max(MIN_REFRESH_MS, refreshSec * 1000)
      : DEFAULTS.refreshMs;

  return {
    groups: groups.length > 0 ? groups : null,
    cols: positiveInt(p.get("cols")),
    rows: positiveInt(p.get("rows")),
    detail: p.get("detail") === "compact" ? "compact" : "full",
    scores: p.get("scores") !== "off",
    upcoming: nonNegativeInt(p.get("upcoming"), DEFAULTS.upcoming),
    finished: nonNegativeInt(p.get("finished"), DEFAULTS.finished),
    refreshMs,
    theme: p.get("theme") === "light" ? "light" : "dark",
    highlight: csvCodes(p.get("highlight")),
    fit: p.get("fit") !== "off",
  };
}

export function deriveGrid(
  n: number,
  cols: number | null,
  rows: number | null,
): { cols: number; rows: number } {
  const count = Math.max(1, n);
  if (cols !== null && rows !== null) return { cols, rows };
  if (cols !== null) return { cols, rows: Math.ceil(count / cols) };
  if (rows !== null) return { cols: Math.ceil(count / rows), rows };
  const c = Math.min(2, count);
  return { cols: c, rows: Math.ceil(count / c) };
}
