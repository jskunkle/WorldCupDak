// Static map of worldcup26.ir stadium ids -> IANA timezone.
// Verified against https://worldcup26.ir/get/stadiums (16 fixed 2026 venues).
const STADIUM_TZ: Record<string, string> = {
  "1": "America/Mexico_City", // Mexico City (Estadio Azteca)
  "2": "America/Mexico_City", // Guadalajara
  "3": "America/Monterrey", // Monterrey
  "4": "America/Chicago", // Dallas (Arlington)
  "5": "America/Chicago", // Houston
  "6": "America/Chicago", // Kansas City
  "7": "America/New_York", // Atlanta
  "8": "America/New_York", // Miami
  "9": "America/New_York", // Boston (Foxborough)
  "10": "America/New_York", // Philadelphia
  "11": "America/New_York", // New York / New Jersey
  "12": "America/New_York", // Toronto
  "13": "America/Vancouver", // Vancouver
  "14": "America/Los_Angeles", // Seattle
  "15": "America/Los_Angeles", // San Francisco Bay Area (Santa Clara)
  "16": "America/Los_Angeles", // Los Angeles (Inglewood)
};

/** Returns the venue's IANA timezone, defaulting to Eastern for unknown ids. */
export function stadiumTimeZone(id: string): string {
  return STADIUM_TZ[id] ?? "America/New_York";
}

/** Offset (ms) that `timeZone`'s wall clock is ahead of UTC at instant `atMs`. */
function tzOffsetMs(timeZone: string, atMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(new Date(atMs))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return localAsUtc - atMs;
}

/**
 * Interprets the wall-clock components as occurring in `timeZone` and returns
 * the true UTC instant. `month` is 1-12. One-pass offset lookup is exact for
 * the WC2026 window (no venue crosses a DST transition Jun 11 - Jul 19 2026).
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(naiveUtc - tzOffsetMs(timeZone, naiveUtc));
}
