import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const API = "http://localhost:3002/api/v1";

test("save, compare, revisit, download, reload and isolate two browsers", async ({ page, browser }) => {
  await page.goto("/");
  await expect(page.getByText("A collection starts with one chance.")).toBeVisible();
  await page.getByRole("button", { name: "Pin this chance to compare" }).click();
  await page.getByRole("button", { name: "Tight angle", exact: false }).click();
  await expect(page.locator(".comparison-result")).toContainText("percentage points");
  await expect(page.locator(".comparison-result strong")).toHaveText(/^-\d/);
  await page.getByLabel("Body part", { exact: true }).selectOption("Head");
  await page.getByRole("button", { name: "Save current shot" }).click();
  await expect(page.getByRole("button", { name: "Shot saved", exact: true })).toBeDisabled();
  const initial = await (await page.request.get(`${API}/shots`)).json();
  expect(initial.shots).toHaveLength(1);
  expect(initial.shots[0].x).toBe(110);
  expect(initial.shots[0].context.body_part).toBe("Head");
  expect(initial.shots[0].model_id).toBe("context-boosted-30k-v1");
  const id = initial.shots[0].id;
  expect(initial.shots[0]).not.toHaveProperty("collection_id");
  await page.getByRole("button", { name: "Long range", exact: false }).click();
  await page.getByRole("button", { name: "Revisit shot at 110.0, 18.0" }).click();
  await expect(page.locator(".geometry")).toContainText("24.2");
  await expect(page.getByLabel("Body part", { exact: true })).toHaveValue("Head");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export page" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("footyiq-shots-page-1.csv");
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain(id);
  expect(csv).toContain("Head");
  expect(csv).toContain("body_part");
  expect(csv).toContain("context-boosted-30k-v1");
  expect(csv.trim().split("\r\n")).toHaveLength(2);
  await page.reload();
  await expect(page.getByRole("button", { name: "Revisit shot at 110.0, 18.0" })).toBeVisible();

  const second = await browser.newContext();
  try {
    const other = await second.newPage();
    await other.goto("http://localhost:3003");
    await expect(other.getByText("A collection starts with one chance.")).toBeVisible();
    expect((await (await second.request.get(`${API}/shots`)).json()).shots).toHaveLength(0);
    expect(await (await second.request.get(`${API}/shots/export`)).text()).not.toContain(id);
    // A known shot ID cannot be used to access another collection's record.
    expect((await second.request.post(`${API}/shots`, { data: { id, x: 90, y: 40 } })).status()).toBe(201);
    expect((await (await second.request.get(`${API}/shots`)).json()).shots[0].x).toBe(90);
    expect((await (await page.request.get(`${API}/shots`)).json()).shots[0].x).toBe(110);
  } finally { await second.close(); }
});

test("clearing collection cookies starts a separate empty collection", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Save current shot" }).click();
  await expect(page.getByRole("button", { name: "Shot saved", exact: true })).toBeDisabled();
  await context.clearCookies();
  await page.reload();
  await expect(page.getByText("A collection starts with one chance.")).toBeVisible();
  expect((await (await page.request.get(`${API}/shots`)).json()).shots).toHaveLength(0);
});

test("prediction and history failures recover without a page reload", async ({ page }) => {
  await page.route("**/api/v1/predict-proxy", (route) => route.abort());
  await page.route("**/api/v1/shots?**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "History unavailable for test" }) }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Save current shot" })).toBeDisabled();
  await expect(page.getByText("History unavailable for test")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry prediction" })).toBeVisible();
  await page.unroute("**/api/v1/predict-proxy");
  await page.unroute("**/api/v1/shots?**");
  await page.getByRole("button", { name: "Retry prediction" }).click();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save current shot" })).toBeEnabled();
  await expect(page.getByText("A collection starts with one chance.")).toBeVisible();
});
