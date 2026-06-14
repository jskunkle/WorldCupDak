import { test, expect } from "@playwright/test";

test("groups param shows only the requested groups", async ({ page }) => {
  await page.goto("/?groups=A,B");
  await expect(page.locator('[data-group="A"]')).toBeVisible();
  await expect(page.locator('[data-group="B"]')).toBeVisible();
  await expect(page.locator("[data-group]")).toHaveCount(2);
});

test("scores=off hides the score feed", async ({ page }) => {
  await page.goto("/?scores=off");
  await expect(page.locator("#scores")).toBeHidden();
});

test("theme=light sets the light theme", async ({ page }) => {
  await page.goto("/?theme=light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("detail=compact renders five columns per table", async ({ page }) => {
  await page.goto("/?groups=A&detail=compact");
  await expect(page.locator('[data-group="A"] th')).toHaveCount(5);
});

test("highlight only marks the named team rows", async ({ page }) => {
  await page.goto("/?highlight=USA");
  // Wait for data to render.
  await expect(page.locator("[data-team]").first()).toBeVisible();
  const highlighted = page.locator("tr.row--highlight");
  const count = await highlighted.count();
  for (let i = 0; i < count; i++) {
    await expect(highlighted.nth(i)).toHaveAttribute("data-team", "USA");
  }
});

for (const size of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  test(`fit keeps content within the viewport (${size.width}x${size.height}, few groups)`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto("/?groups=A,B");
    await expect(page.locator('[data-group="A"]')).toBeVisible();
    const overflow = await page.evaluate(() => {
      const app = document.getElementById("app")!;
      return {
        dh: app.scrollHeight - app.clientHeight,
        dw: app.scrollWidth - app.clientWidth,
      };
    });
    expect(overflow.dh).toBeLessThanOrEqual(1);
    expect(overflow.dw).toBeLessThanOrEqual(1);
  });

  test(`fit keeps content within the viewport (${size.width}x${size.height}, all groups)`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    await expect(page.locator('[data-group="L"]')).toBeVisible();
    const overflow = await page.evaluate(() => {
      const app = document.getElementById("app")!;
      return {
        dh: app.scrollHeight - app.clientHeight,
        dw: app.scrollWidth - app.clientWidth,
      };
    });
    expect(overflow.dh).toBeLessThanOrEqual(1);
    expect(overflow.dw).toBeLessThanOrEqual(1);
  });
}
