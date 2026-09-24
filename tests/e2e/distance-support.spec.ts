import { test, expect } from "@playwright/test";

test("explains free-kick fields and withholds distant header estimates", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Body part", { exact: true }).selectOption("Head");
  const pitch = page.getByRole("group", { name: "Interactive soccer pitch" });
  await pitch.focus();
  for (let i = 0; i < 9; i++) await page.keyboard.press("Shift+ArrowDown");
  await expect(page.getByRole("region", { name: "Chance quality" }).getByRole("alert")).toContainText("Outside training range");
  await expect(page.getByRole("button", { name: "Save current shot" })).toBeDisabled();
  await page.getByRole("button", { name: /Central chance/ }).click();
  await expect(page.getByRole("button", { name: "Save current shot" })).toBeEnabled();
  await page.getByText("What do these choices mean?", {exact:true}).click();
  await expect(page.getByText(/header from a free-kick cross/)).toBeVisible();
});
