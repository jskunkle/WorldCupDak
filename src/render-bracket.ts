import type {
  Bracket,
  BracketMatch,
  BracketSlot,
  KnockoutRound,
  FeedKind,
} from "./types";
import { activeRound } from "./bracket";

const ROUND_LABEL: Record<KnockoutRound, string> = {
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarterfinals",
  sf: "Semifinals",
  final: "Final",
  third: "Third place",
};

const LEFT_COLUMN_ROUNDS: KnockoutRound[] = ["r32", "r16", "qf", "sf"];

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showScore(m: BracketMatch, slot: BracketSlot): boolean {
  return !slot.tbd && (m.status === "finished" || m.status === "live");
}

function slotRow(m: BracketMatch, slot: BracketSlot): HTMLElement {
  const row = el("div", slot.tbd ? "bm-row tbd" : "bm-row");
  if (!slot.tbd) row.setAttribute("data-team", slot.code);

  if (slot.tbd || !slot.flagUrl) {
    row.appendChild(el("span", "bm-flagph"));
  } else {
    const img = document.createElement("img");
    img.className = "bm-flag";
    img.src = slot.flagUrl;
    img.alt = slot.code || slot.name;
    img.addEventListener("error", () =>
      img.replaceWith(el("span", "bm-flagph")),
    );
    row.appendChild(img);
  }

  row.appendChild(el("span", "bm-name", slot.tbd ? "TBD" : slot.name));
  if (showScore(m, slot)) {
    row.appendChild(el("span", "bm-score", String(slot.score)));
  }
  return row;
}

function matchEl(m: BracketMatch, extraClass = ""): HTMLElement {
  const box = el("div", `bm${m.status === "live" ? " live" : ""}${extraClass}`);
  box.setAttribute("data-match", m.id);
  box.appendChild(slotRow(m, m.home));
  box.appendChild(slotRow(m, m.away));
  return box;
}

function columnEl(matches: BracketMatch[], round: KnockoutRound): HTMLElement {
  const col = el("div", `bcol ${round}`);
  col.setAttribute("data-round", round);
  col.appendChild(el("div", "bcol-label", ROUND_LABEL[round]));
  const cells = el("div", "bcol-cells");
  for (const m of matches) {
    const cell = el("div", "bcell");
    cell.appendChild(matchEl(m));
    cells.appendChild(cell);
  }
  col.appendChild(cells);
  return col;
}

function sideEl(
  columns: BracketMatch[][],
  side: "left" | "right",
): HTMLElement {
  const wrap = el("div", `bside ${side}`);
  // left renders outer→inner (r32..sf); right renders inner→outer (sf..r32).
  const order =
    side === "left"
      ? LEFT_COLUMN_ROUNDS.map((_, i) => i)
      : LEFT_COLUMN_ROUNDS.map((_, i) => LEFT_COLUMN_ROUNDS.length - 1 - i);
  for (const i of order) {
    wrap.appendChild(columnEl(columns[i], LEFT_COLUMN_ROUNDS[i]));
  }
  return wrap;
}

function finalColumn(bracket: Bracket): HTMLElement {
  const col = el("div", "bcol final");
  col.setAttribute("data-round", "final");
  col.appendChild(el("div", "bcol-label", ROUND_LABEL.final));
  const cells = el("div", "bcol-cells");
  const cell = el("div", "bcell bfinal-cell");
  cell.appendChild(el("div", "btrophy", "🏆"));
  if (bracket.final) {
    cell.appendChild(matchEl(bracket.final, " final-box"));
  }
  const thirdText = bracket.third
    ? thirdLabel(bracket.third)
    : "3rd place · TBD";
  cell.appendChild(el("div", "bthird", thirdText));
  cells.appendChild(cell);
  col.appendChild(cells);
  return col;
}

function thirdLabel(m: BracketMatch): string {
  const name = (s: BracketSlot) => (s.tbd ? "TBD" : s.code || s.name);
  if (m.status === "finished" || m.status === "live") {
    return `3rd: ${name(m.home)} ${m.home.score}–${m.away.score} ${name(m.away)}`;
  }
  return `3rd: ${name(m.home)} v ${name(m.away)}`;
}

export function renderFullBracket(
  container: HTMLElement,
  bracket: Bracket,
): void {
  container.replaceChildren();
  container.appendChild(
    el("h2", "bracket-title", "FIFA World Cup 2026 — Knockout Bracket"),
  );
  const board = el("div", "bboard");
  board.appendChild(sideEl(bracket.left, "left"));
  board.appendChild(finalColumn(bracket));
  board.appendChild(sideEl(bracket.right, "right"));
  container.appendChild(board);
}

const FOCUS_PAGE_SIZE = 4;
const RAIL_ROUNDS: KnockoutRound[] = ["r32", "r16", "qf", "sf", "final"];

const STATUS_RANK: Record<FeedKind, number> = {
  live: 0,
  upcoming: 1,
  finished: 2,
};

function orderForFocus(matches: BracketMatch[]): BracketMatch[] {
  return [...matches].sort((a, b) => {
    const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (r !== 0) return r;
    // upcoming soonest-first; finished/live most-recent-first.
    const dir = a.status === "upcoming" ? 1 : -1;
    return dir * (a.kickoff.getTime() - b.kickoff.getTime());
  });
}

function whenText(m: BracketMatch): string {
  if (m.status === "live") return "LIVE";
  const opts: Intl.DateTimeFormatOptions =
    m.status === "finished"
      ? { weekday: "short" }
      : { weekday: "short", hour: "numeric", minute: "2-digit" };
  return m.kickoff.toLocaleString(undefined, opts);
}

function focusSide(slot: BracketSlot, side: "home" | "away"): HTMLElement {
  const wrap = el("div", `bfocus-side ${side}`);
  const name = el("span", undefined, slot.tbd ? "TBD" : slot.code || slot.name);
  if (!slot.tbd && slot.flagUrl) {
    const img = document.createElement("img");
    img.src = slot.flagUrl;
    img.alt = slot.code || slot.name;
    img.addEventListener("error", () => img.remove());
    // Flag before name on the home side, after on the away side.
    if (side === "home") {
      wrap.appendChild(img);
      wrap.appendChild(name);
    } else {
      wrap.appendChild(name);
      wrap.appendChild(img);
    }
  } else {
    wrap.appendChild(name);
  }
  return wrap;
}

function focusCard(m: BracketMatch): HTMLElement {
  const card = el("div", `bfocus-card${m.status === "live" ? " live" : ""}`);
  card.setAttribute("data-match", m.id);
  card.appendChild(focusSide(m.home, "home"));

  const mid = el("div", "bfocus-mid");
  const scored = m.status === "finished" || m.status === "live";
  mid.appendChild(
    el(
      "div",
      "bfocus-vs",
      scored ? `${m.home.score} – ${m.away.score}` : "vs",
    ),
  );
  mid.appendChild(el("div", "bfocus-when", whenText(m)));
  card.appendChild(mid);

  card.appendChild(focusSide(m.away, "away"));
  return card;
}

function progressRail(bracket: Bracket): HTMLElement {
  const rail = el("div", "bfocus-rail");
  rail.appendChild(el("div", "brail-round", "Bracket progress"));
  for (const round of RAIL_ROUNDS) {
    const matches = bracket.rounds[round];
    if (!matches.length) continue;
    rail.appendChild(el("div", "brail-round", ROUND_LABEL[round]));
    const dots = el("div", "brail-dots");
    for (const m of matches) {
      const cls =
        m.status === "live"
          ? "brail-dot live"
          : m.status === "finished"
            ? "brail-dot done"
            : "brail-dot";
      dots.appendChild(el("span", cls));
    }
    rail.appendChild(dots);
  }
  return rail;
}

export function renderFocusedBracket(
  container: HTMLElement,
  bracket: Bracket,
  pageIndex = 0,
): void {
  container.replaceChildren();
  const round = activeRound(bracket);
  const matches = orderForFocus(bracket.rounds[round]);
  const pages = Math.max(1, Math.ceil(matches.length / FOCUS_PAGE_SIZE));
  const page = ((pageIndex % pages) + pages) % pages;
  const shown = matches.slice(
    page * FOCUS_PAGE_SIZE,
    page * FOCUS_PAGE_SIZE + FOCUS_PAGE_SIZE,
  );

  container.appendChild(
    el(
      "div",
      "bfocus-title",
      `${ROUND_LABEL[round]}${pages > 1 ? ` · ${page + 1}/${pages}` : ""}`,
    ),
  );

  const focus = el("div", "bfocus");
  const main = el("div", "bfocus-main");
  for (const m of shown) main.appendChild(focusCard(m));
  focus.appendChild(main);
  focus.appendChild(progressRail(bracket));
  container.appendChild(focus);
}
