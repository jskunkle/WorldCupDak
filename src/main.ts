import { fetchTeams, fetchGames } from "./api";
import { computeStandings, buildScoreFeed, filterGroups } from "./standings";
import { renderStandings, renderScoreFeed } from "./render";
import { selectView, buildBracket } from "./bracket";
import { renderFullBracket, renderFocusedBracket } from "./render-bracket";
import { parseConfig, deriveGrid } from "./config";
import { fitToViewport } from "./fit";
import { needsTeamsRefresh } from "./refresh-policy";
import { readCache, writeCache } from "./cache";
import type { Snapshot, Team, Game } from "./types";

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
    const games = await fetchGames();
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
  const view = selectView(lastGames, new Date(), config);
  appEl.setAttribute("data-view", view);

  if (view === "bracket") {
    paintBracket();
    return;
  }

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

function paintBracket(): void {
  groupsEl.style.display = "none";
  scoresEl.style.display = "none";
  bracketEl.style.display = "";

  const bracket = buildBracket(lastGames, cachedTeams ?? [], new Date());

  if (config.bracket === "focused") {
    renderFocusedBracket(bracketEl, bracket, focusPage);
    startFocusRotation();
  } else {
    stopFocusRotation();
    renderFullBracket(bracketEl, bracket);
  }
}

function startFocusRotation(): void {
  if (focusTimer !== undefined) return;
  focusTimer = window.setInterval(() => {
    focusPage += 1;
    const bracket = buildBracket(lastGames, cachedTeams ?? [], new Date());
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
  cachedTeams = cached.teams;
  lastGames = cached.games;
  teamsFetchedAt = Date.now();
  lastGood = buildSnapshot(cached.teams, cached.games);
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

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stop();
    stopFocusRotation();
  } else {
    void refresh();
    start();
  }
});

window.addEventListener("resize", () => {
  if (!config.fit) return;
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => fitToViewport(appEl), 150);
});

seedFromCache();
void refresh();
start();
