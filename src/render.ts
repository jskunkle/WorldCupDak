import type { GroupTable, FeedMatch, StandingRow } from "./types";

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

interface StatColumn {
  header: string;
  get: (r: StandingRow) => number;
  className?: string;
}

const FULL_STATS: StatColumn[] = [
  { header: "GP", get: (r) => r.gp },
  { header: "W", get: (r) => r.w },
  { header: "D", get: (r) => r.d },
  { header: "L", get: (r) => r.l },
  { header: "GF", get: (r) => r.gf },
  { header: "GA", get: (r) => r.ga },
  { header: "GD", get: (r) => r.gd },
  { header: "Pts", get: (r) => r.pts, className: "pts" },
];

const COMPACT_STATS: StatColumn[] = [
  { header: "GD", get: (r) => r.gd },
  { header: "Pts", get: (r) => r.pts, className: "pts" },
];

export function renderStandings(
  container: HTMLElement,
  groups: GroupTable[],
  options: { detail?: "compact" | "full"; highlight?: string[] } = {},
): void {
  container.replaceChildren(); // in-place refresh: clear then repaint

  const stats = options.detail === "compact" ? COMPACT_STATS : FULL_STATS;
  const highlight = new Set(options.highlight ?? []);

  for (const g of groups) {
    const card = el("section", "group-card");
    card.setAttribute("data-group", g.group);
    card.appendChild(el("h2", "group-title", `Group ${g.group}`));

    const table = el("table", "standings");
    const head = el("tr", "head");
    ["#", "", "Team", ...stats.map((s) => s.header)].forEach((h) =>
      head.appendChild(el("th", undefined, h)),
    );
    table.appendChild(head);

    g.rows.forEach((r) => {
      const classes = ["row"];
      if (r.rank <= 2) classes.push("advancing");
      if (highlight.has(r.code)) classes.push("row--highlight");
      const tr = el("tr", classes.join(" "));
      tr.setAttribute("data-team", r.code);

      tr.appendChild(el("td", "rank", String(r.rank)));

      const flagCell = el("td", "flag-cell");
      const flag = document.createElement("img");
      flag.className = "flag";
      flag.src = r.flagUrl;
      flag.alt = r.name;
      flag.addEventListener("error", () => {
        flagCell.replaceChildren(el("span", "flag-fallback", r.code));
      });
      flagCell.appendChild(flag);
      tr.appendChild(flagCell);

      tr.appendChild(el("td", "team", r.code));
      stats.forEach((s) =>
        tr.appendChild(el("td", s.className, String(s.get(r)))),
      );
      table.appendChild(tr);
    });

    card.appendChild(table);
    container.appendChild(card);
  }
}

export function renderScoreFeed(
  container: HTMLElement,
  feed: FeedMatch[],
): void {
  container.replaceChildren();
  for (const m of feed) {
    const item = el("span", `match ${m.kind}`);
    item.setAttribute("data-match", m.id);
    const score =
      m.kind === "upcoming" ? "vs" : `${m.homeScore}-${m.awayScore}`;
    item.appendChild(el("span", "home", m.homeName));
    item.appendChild(el("span", "score", score));
    item.appendChild(el("span", "away", m.awayName));
    container.appendChild(item);
  }
}
