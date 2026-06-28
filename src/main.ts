import { fetchTeams, fetchGames } from "./api";
import { computeStandings, buildScoreFeed, filterGroups } from "./standings";
import { renderStandings, renderScoreFeed } from "./render";
import { selectView, buildBracket, bracketHasMatches } from "./bracket";
import { resolveAdvancement } from "./advance";
import { renderFullBracket, renderFocusedBracket } from "./render-bracket";
import { parseConfig, deriveGrid, type RotateView } from "./config";
import { fitToViewport, fitBracket } from "./fit";
import { needsTeamsRefresh } from "./refresh-policy";
import { readCache, writeCache } from "./cache";
import type { Snapshot, Team, Game, Bracket } from "./types";

const config = parseConfig(window.location.search);

const TEAMS_MAX_AGE_MS = 3_600_000; // refresh teams at most hourly
const CACHE_MAX_AGE_MS = 3_600_000; // use cached data for instant paint if < 1h old

const appEl = document.getElementById("app")!;
const groupsEl = document.getElementById("groups")!;
const scoresEl = document.getElementById("scores")!;
const bracketEl = document.getElementById("bracket")!;

// Apply one-time config to the DOM.
document.documentElement.setAttribute("data-theme", config.theme);
appEl.setAttribute("data-fit", config.fit ? "on" : "off");
if (!config.scores) scoresEl.style.display = "none";

let cachedTeams: Team[] | null = null;
let teamsFetchedAt: number | null = null;
let lastGood: Snapshot | null = null;
let timer: number | undefined;
let resizeTimer: number | undefined;
let lastGames: Game[] = [];
let focusTimer: number | undefined;
let focusPage = 0;
const FOCUS_ROTATE_MS = 10_000;

// Which concrete view (standings, full bracket, or focused bracket) to paint.
type ViewSpec = { view: "standings" | "bracket"; bracket: "full" | "focused" };
const ROTATE_SPEC: Record<RotateView, ViewSpec> = {
  standings: { view: "standings", bracket: "full" },
  bracket: { view: "bracket", bracket: "full" },
  focused: { view: "bracket", bracket: "focused" },
};
let rotationIndex = 0;
let rotationTimer: number | undefined;
let currentSpec: ViewSpec = { view: "standings", bracket: "full" };

// The view to paint now: a rotation step if rotation is on, else the
// auto/explicit selection. Rotation bypasses the group-stage auto-gating so a
// listed view (e.g. the bracket) shows regardless of tournament state.
function effectiveSpec(): ViewSpec {
  if (config.rotate.length > 0) {
    return ROTATE_SPEC[config.rotate[rotationIndex % config.rotate.length]];
  }
  return {
    view: selectView(lastGames, new Date(), config),
    bracket: config.bracket,
  };
}

function buildSnapshot(teams: Team[], games: Game[]): Snapshot {
  return {
    groups: filterGroups(computeStandings(teams, games), config.groups),
    feed: buildScoreFeed(games, new Date(), {
      maxUpcoming: config.upcoming,
      maxFinished: config.finished,
    }),
  };
}

async function refresh(): Promise<void> {
  try {
    // Advance winners into the next round client-side: the data source leaves
    // future knockout games at placeholder team id "0" even after a feeder match
    // finishes, so a team would otherwise never appear past its current round.
    const games = resolveAdvancement(await fetchGames());
    lastGames = games;
    const ids = cachedTeams ? new Set(cachedTeams.map((t) => t.id)) : null;
    if (
      needsTeamsRefresh(
        ids,
        teamsFetchedAt,
        games,
        Date.now(),
        TEAMS_MAX_AGE_MS,
      )
    ) {
      try {
        cachedTeams = await fetchTeams();
        teamsFetchedAt = Date.now();
      } catch (err) {
        // No teams at all → can't render; fail this cycle. Otherwise reuse cache.
        if (cachedTeams === null) throw err;
        console.error("Teams refresh failed; reusing cached teams.", err);
      }
    }
    const teams = cachedTeams!;
    lastGood = buildSnapshot(teams, games);
    writeCache(teams, games, Date.now());
    paint(lastGood);
  } catch (err) {
    console.error("Refresh failed; keeping last-good data.", err);
    // Intentionally do not clear the screen — lastGood stays painted.
  }
}

function paint(s: Snapshot): void {
  const spec = effectiveSpec();

  // Only show a bracket that actually has matches. If the data source dropped
  // the knockout games (e.g. a failover), the bracket would render as a lone
  // trophy and fitBracket would blow the font up — fall back to standings.
  if (spec.view === "bracket") {
    const bracket = buildBracket(lastGames, cachedTeams ?? [], new Date());
    if (bracketHasMatches(bracket)) {
      currentSpec = spec;
      appEl.setAttribute("data-view", "bracket");
      paintBracket(spec.bracket, bracket);
      return;
    }
  }

  currentSpec = { view: "standings", bracket: "full" };
  appEl.setAttribute("data-view", "standings");
  stopFocusRotation();
  bracketEl.style.display = "none";
  groupsEl.style.display = "";
  if (config.scores) scoresEl.style.display = "";

  const grid = deriveGrid(s.groups.length, config.cols, config.rows);
  groupsEl.style.setProperty("--cols", String(grid.cols));
  groupsEl.style.setProperty("--rows", String(grid.rows));

  renderStandings(groupsEl, s.groups, {
    detail: config.detail,
    highlight: config.highlight,
  });
  if (config.scores) renderScoreFeed(scoresEl, s.feed);
  if (config.fit) fitToViewport(appEl);
}

function paintBracket(layout: "full" | "focused", bracket: Bracket): void {
  groupsEl.style.display = "none";
  scoresEl.style.display = "none";
  bracketEl.style.display = "";

  if (layout === "focused") {
    // Focused cards are clamp-sized; clear any root font-size left by a fit pass.
    document.documentElement.style.fontSize = "";
    renderFocusedBracket(bracketEl, bracket, focusPage);
    startFocusRotation();
  } else {
    stopFocusRotation();
    renderFullBracket(bracketEl, bracket);
    if (config.fit) fitBracket(appEl);
  }
}

function startFocusRotation(): void {
  if (focusTimer !== undefined) return;
  focusTimer = window.setInterval(() => {
    focusPage += 1;
    const bracket = buildBracket(lastGames, cachedTeams ?? [], new Date());
    if (!bracketHasMatches(bracket)) return; // skip an empty refresh
    renderFocusedBracket(bracketEl, bracket, focusPage);
  }, FOCUS_ROTATE_MS);
}

function stopFocusRotation(): void {
  if (focusTimer === undefined) return;
  window.clearInterval(focusTimer);
  focusTimer = undefined;
  focusPage = 0; // re-enter focused mode from the first page
}

// Paint instantly from a fresh-enough cache before the first network round-trip.
function seedFromCache(): void {
  const cached = readCache(CACHE_MAX_AGE_MS, Date.now());
  if (!cached) return;
  const games = resolveAdvancement(cached.games);
  cachedTeams = cached.teams;
  lastGames = games;
  teamsFetchedAt = Date.now();
  lastGood = buildSnapshot(cached.teams, games);
  paint(lastGood);
}

function start(): void {
  if (timer !== undefined) return;
  timer = window.setInterval(refresh, config.refreshMs);
}

function stop(): void {
  if (timer === undefined) return;
  window.clearInterval(timer);
  timer = undefined;
}

// Cycle through config.rotate on an interval, repainting each step.
function startRotation(): void {
  if (rotationTimer !== undefined || config.rotate.length < 2) return;
  rotationTimer = window.setInterval(() => {
    rotationIndex = (rotationIndex + 1) % config.rotate.length;
    if (lastGood) paint(lastGood);
  }, config.rotateSecs * 1000);
}

function stopRotation(): void {
  if (rotationTimer === undefined) return;
  window.clearInterval(rotationTimer);
  rotationTimer = undefined;
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stop();
    stopFocusRotation();
    stopRotation();
  } else {
    void refresh();
    start();
    startRotation();
  }
});

function refit(): void {
  if (!config.fit) return;
  if (currentSpec.view === "bracket") {
    if (currentSpec.bracket === "full") fitBracket(appEl);
  } else {
    fitToViewport(appEl);
  }
}

window.addEventListener("resize", () => {
  if (!config.fit) return;
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(refit, 150);
});

seedFromCache();
void refresh();
start();
startRotation();
