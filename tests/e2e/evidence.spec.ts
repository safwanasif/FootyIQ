import { test, expect } from "@playwright/test";

test("evidence separates serving results, expanded data and the final model decision", async ({ page }) => {
  await page.goto("/#model-title");
  await expect(page.getByRole("heading", { name: "Current prediction model" })).toBeVisible();
  await expect(page.getByText("3,770", { exact: true })).toBeVisible();
  await expect(page.getByText("30,011", { exact: true })).toBeVisible();
  const disclosure = page.locator("summary").filter({ hasText: "See all 12 competitions" });
  await disclosure.focus();
  await page.keyboard.press("Enter");
  const table = page.getByRole("table", { name: "Expanded dataset by competition" });
  await expect(table).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(13);
  await expect(table.getByRole("row").filter({ hasText: "Premier League" })).toContainText("4,563");
  await expect(table.getByRole("row").filter({ hasText: "FIFA World Cup" })).toContainText("3,068");
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(table).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.locator("summary").filter({ hasText: "Final v1 model review" }).click();
  await expect(page.getByText(/3,014 previously unused shots/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Final model decision" })).toHaveAttribute("href", /model-selection\/decision\.md$/);
});
