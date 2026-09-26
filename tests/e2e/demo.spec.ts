import { test, expect } from "@playwright/test";

// A real, silent automated walkthrough, retained as a shareable CI artifact.
test.use({ video: { mode: "on", size: { width: 1280, height: 900 } }, viewport: { width: 1280, height: 900 } });
test("record the verified product walkthrough", async ({ page }) => {
  test.setTimeout(90_000);
  // Presentation pauses happen after assertions, never as readiness checks.
  const showResult = () => page.waitForTimeout(6_000);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Save current shot" })).toBeEnabled();
  await page.getByRole("link", { name: "Shot lab", exact: true }).click();
  await showResult();
  await page.getByRole("button", { name: "Pin this chance to compare" }).click();
  await page.getByRole("button", { name: "Tight angle", exact: false }).click();
  await expect(page.locator(".comparison-result strong")).toHaveText(/^-\d/);
  await showResult();
  await page.getByRole("button", { name: "Central chance", exact: false }).click();
  await page.getByLabel("Body part", { exact: true }).selectOption("Head");
  await expect(page.locator(".probability")).toContainText("7.0");
  await showResult();
  await page.getByRole("button", { name: "Long range", exact: false }).click();
  await expect(page.getByRole("region", { name: "Chance quality" }).getByRole("alert")).toContainText("Outside training range");
  await showResult();
  await page.getByRole("button", { name: "Central chance", exact: false }).click();
  await page.getByRole("button", { name: "Save current shot" }).click();
  await expect(page.getByRole("button", { name: "Shot saved", exact: true })).toBeDisabled();
  await showResult();
  await page.reload();
  await page.getByRole("button", { name: "Revisit shot at 108.0, 40.0" }).click();
  await expect(page.getByLabel("Body part", { exact: true })).toHaveValue("Head");
  await showResult();
  await page.getByRole("link", { name: "The model", exact: true }).click();
  await page.getByText("How the current model was evaluated", { exact: true }).click();
  await expect(page.getByText(/3,009 previously unused shots/)).toBeVisible();
  await showResult();
});
