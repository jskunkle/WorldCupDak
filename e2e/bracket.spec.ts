import { test, expect, type Page } from "@playwright/test";

// The deployed Worker locks CORS to the Render origin, so a localhost preview
// cannot load live data. Mock the (already-normalized) Worker payloads so these
// tests verify rendering deterministically, independent of origin and live API.

const TEAMS = [
  {
    id: "1",
    name: "Brazil",
    code: "BRA",
    flagUrl: "https://flagcdn.com/w80/br.png",
    group: "A",
  },
  {
    id: "2",
    name: "Japan",
    code: "JPN",
    flagUrl: "https://flagcdn.com/w80/jp.png",
    group: "A",
  },
  {
    id: "3",
    name: "Germany",
    code: "GER",
    flagUrl: "https://flagcdn.com/w80/de.png",
    group: "A",
  },
  {
    id: "4",
    name: "Mexico",
    code: "MEX",
    flagUrl: "https://flagcdn.com/w80/mx.png",
    group: "A",
  },
];

const GAMES = [
  // Group stage (finished) so standings render.
  {
    id: "1",
    homeId: "1",
    awayId: "2",
    homeName: "Brazil",
    awayName: "Japan",
    homeScore: 2,
    awayScore: 0,
    group: "A",
    matchday: 1,
    kickoff: "2026-06-12T12:00:00.000Z",
    finished: true,
    isGroupStage: true,
  },
  {
    id: "2",
    homeId: "3",
    awayId: "4",
    homeName: "Germany",
    awayName: "Mexico",
    homeScore: 1,
    awayScore: 1,
    group: "A",
    matchday: 1,
    kickoff: "2026-06-12T15:00:00.000Z",
    finished: true,
    isGroupStage: true,
  },
  // Round of 32 (knockout) so the bracket has matches.
  {
    id: "73",
    homeId: "1",
    awayId: "2",
    homeName: "Brazil",
    awayName: "Japan",
    homeScore: 0,
    awayScore: 0,
    group: "R32",
    matchday: 4,
    kickoff: "2026-06-28T12:00:00.000Z",
    finished: false,
    isGroupStage: false,
  },
  {
    id: "74",
    homeId: "3",
    awayId: "4",
    homeName: "Germany",
    awayName: "Mexico",
    homeScore: 0,
    awayScore: 0,
    group: "R32",
    matchday: 4,
    kickoff: "2026-06-29T12:00:00.000Z",
    finished: false,
    isGroupStage: false,
  },
  // Two more R32 games → an even count per side, matching real data (the
  // bracket's connectors assume even per-side counts, which is always true once
  // all 16 R32 fixtures exist).
  {
    id: "75",
    homeId: "1",
    awayId: "3",
    homeName: "Brazil",
    awayName: "Germany",
    homeScore: 0,
    awayScore: 0,
    group: "R32",
    matchday: 4,
    kickoff: "2026-06-30T12:00:00.000Z",
    finished: false,
    isGroupStage: false,
  },
  {
    id: "76",
    homeId: "2",
    awayId: "4",
    homeName: "Japan",
    awayName: "Mexico",
    homeScore: 0,
    awayScore: 0,
    group: "R32",
    matchday: 4,
    kickoff: "2026-07-01T12:00:00.000Z",
    finished: false,
    isGroupStage: false,
  },
];

async function mockApi(page: Page): Promise<void> {
  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body),
  });
  await page.route("**/get/teams", (route) => route.fulfill(json(TEAMS)));
  await page.route("**/get/games", (route) => route.fulfill(json(GAMES)));
}

test("view=bracket shows the full bracket with round columns", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/?view=bracket");
  await expect(page.locator("#bracket")).toBeVisible();
  await expect(page.locator("#groups")).toBeHidden();
  // All six round columns render (r32/r16/qf/sf on both sides + final).
  await expect(page.locator('[data-round="r32"]').first()).toBeVisible();
  await expect(page.locator('[data-round="final"]')).toBeVisible();
  // The mocked R32 matches are present, labeled by FIFA code.
  await expect(page.locator('[data-match="73"]')).toBeVisible();
  await expect(page.locator('[data-team="BRA"]').first()).toBeVisible();
  // Auto-fit must scale the bracket to fill, not overflow, the viewport.
  const overflow = await page.evaluate(() => {
    const app = document.getElementById("app")!;
    return {
      dh: app.scrollHeight - app.clientHeight,
      dw: app.scrollWidth - app.clientWidth,
    };
  });
  expect(overflow.dw).toBeLessThanOrEqual(1);
  expect(overflow.dh).toBeLessThanOrEqual(1);
});

test("view=bracket&bracket=focused shows large match cards", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/?view=bracket&bracket=focused");
  await expect(page.locator(".bfocus-main")).toBeVisible();
  await expect(page.locator(".bfocus-card").first()).toBeVisible();
  await expect(page.locator(".bfocus-rail")).toBeVisible();
});

test("view=standings still shows group tables", async ({ page }) => {
  await mockApi(page);
  await page.goto("/?view=standings");
  await expect(page.locator('[data-group="A"]')).toBeVisible();
  await expect(page.locator("#bracket")).toBeHidden();
});

test("an empty bracket falls back to standings", async ({ page }) => {
  // Serve only group-stage games (as a failover source without knockout data
  // would): the bracket has nothing to draw, so it must show standings instead
  // of a lone trophy — even when the bracket view is forced.
  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body),
  });
  await page.route("**/get/teams", (route) => route.fulfill(json(TEAMS)));
  await page.route("**/get/games", (route) =>
    route.fulfill(json(GAMES.filter((g) => g.isGroupStage))),
  );
  await page.goto("/?view=bracket");
  await expect(page.locator('[data-group="A"]')).toBeVisible();
  await expect(page.locator("#bracket")).toBeHidden();
  await expect(page.locator(".btrophy")).toHaveCount(0);
});

test("rotate cycles between views on the interval", async ({ page }) => {
  await mockApi(page);
  await page.goto("/?rotate=standings,bracket&rotateSecs=5");
  // First step (index 0) is standings.
  await expect(page.locator('[data-group="A"]')).toBeVisible();
  await expect(page.locator("#bracket")).toBeHidden();
  // After the interval it rotates to the bracket.
  await expect(page.locator('[data-round="r32"]').first()).toBeVisible({
    timeout: 15000,
  });
  await expect(page.locator("#groups")).toBeHidden();
});
