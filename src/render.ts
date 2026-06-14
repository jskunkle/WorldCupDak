import type { GroupTable, FeedMatch } from "./types";

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderStandings(
  container: HTMLElement,
  groups: GroupTable[],
): void {
  container.replaceChildren(); // in-place refresh: clear then repaint

  for (const g of groups) {
    const card = el("section", "group-card");
    card.setAttribute("data-group", g.group);
    card.appendChild(el("h2", "group-title", `Group ${g.group}`));

    const table = el("table", "standings");
    const head = el("tr", "head");
    ["#", "", "Team", "GP", "W", "D", "L", "GF", "GA", "GD", "Pts"].forEach(
      (h) => head.appendChild(el("th", undefined, h)),
    );
    table.appendChild(head);

    g.rows.forEach((r) => {
      const tr = el("tr", r.rank <= 2 ? "advancing" : undefined);
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
      [r.gp, r.w, r.d, r.l, r.gf, r.ga, r.gd].forEach((v) =>
        tr.appendChild(el("td", undefined, String(v))),
      );
      tr.appendChild(el("td", "pts", String(r.pts)));
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
