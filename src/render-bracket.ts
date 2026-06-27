import type {
  Bracket,
  BracketMatch,
  BracketSlot,
  KnockoutRound,
} from "./types";

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
    img.alt = slot.code;
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
