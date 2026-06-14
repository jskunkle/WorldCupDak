import { test, expect } from "@playwright/test";

test("renders all 12 group tables and a scores strip", async ({ page }) => {
  await page.goto("/");

  // All 12 group headers A–L are visible.
  for (const letter of "ABCDEFGHIJKL") {
    await expect(
      page.locator(`[data-group="${letter}"]`).getByText(`Group ${letter}`),
    ).toBeVisible();
  }

  // Each group shows four teams.
  await expect(page.locator('[data-group="A"] [data-team]')).toHaveCount(4);

  // The scores strip is present.
  await expect(page.locator("#scores")).toBeVisible();
});
