import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("desktop and mobile content pass automated accessibility checks", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Save current shot" })).toBeEnabled();
  // Include explanatory content hidden behind native disclosure controls.
  for (const disclosure of await page.locator("details > summary").all()) await disclosure.click();
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 });
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
