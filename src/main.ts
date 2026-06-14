import { fetchData } from "./api";
import { computeStandings, buildScoreFeed } from "./standings";
import { renderStandings, renderScoreFeed } from "./render";
import type { Snapshot } from "./types";

const REFRESH_MS = 90_000;

const groupsEl = document.getElementById("groups")!;
const scoresEl = document.getElementById("scores")!;

let lastGood: Snapshot | null = null;
let timer: number | undefined;

async function refresh(): Promise<void> {
  try {
    const { teams, games } = await fetchData();
    lastGood = {
      groups: computeStandings(teams, games),
      feed: buildScoreFeed(games, new Date()),
    };
    paint(lastGood);
  } catch (err) {
    console.error("Refresh failed; keeping last-good data.", err);
    // Intentionally do not clear the screen — lastGood stays painted.
  }
}

function paint(s: Snapshot): void {
  renderStandings(groupsEl, s.groups);
  renderScoreFeed(scoresEl, s.feed);
}

function start(): void {
  if (timer !== undefined) return;
  timer = window.setInterval(refresh, REFRESH_MS);
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

void refresh();
start();
