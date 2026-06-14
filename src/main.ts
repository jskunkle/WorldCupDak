import { fetchData } from "./api";
import { computeStandings, buildScoreFeed, filterGroups } from "./standings";
import { renderStandings, renderScoreFeed } from "./render";
import { parseConfig, deriveGrid } from "./config";
import { fitToViewport } from "./fit";
import type { Snapshot } from "./types";

const config = parseConfig(window.location.search);

const appEl = document.getElementById("app")!;
const groupsEl = document.getElementById("groups")!;
const scoresEl = document.getElementById("scores")!;

// Apply one-time config to the DOM.
document.documentElement.setAttribute("data-theme", config.theme);
appEl.setAttribute("data-fit", config.fit ? "on" : "off");
if (!config.scores) scoresEl.style.display = "none";

let lastGood: Snapshot | null = null;
let timer: number | undefined;
let resizeTimer: number | undefined;

async function refresh(): Promise<void> {
  try {
    const { teams, games } = await fetchData();
    lastGood = {
      groups: filterGroups(computeStandings(teams, games), config.groups),
      feed: buildScoreFeed(games, new Date(), {
        maxUpcoming: config.upcoming,
        maxFinished: config.finished,
      }),
    };
    paint(lastGood);
  } catch (err) {
    console.error("Refresh failed; keeping last-good data.", err);
    // Intentionally do not clear the screen — lastGood stays painted.
  }
}

function paint(s: Snapshot): void {
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

void refresh();
start();
