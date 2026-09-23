import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { requestLimit } from "./rate-limit";
import { validateConfig } from "./config";

test("configuration rejects unsafe public cookies and invalid service settings", () => {
  const base = { DATABASE_URL: "postgresql://user:pass@localhost:5432/footyiq" };
  assert.equal(validateConfig(base).port, 3001);
  assert.equal(validateConfig({ ...base, COOKIE_SECURE: "false" }).secureCookies, false);
  assert.equal(validateConfig({ ...base, WEB_ORIGIN: "https://demo.example.com" }).secureCookies, true);
  for (const overrides of [{ DATABASE_URL: "" }, { DATABASE_URL: "https://host/db" },
    { WEB_ORIGIN: "https://example.com/path" }, { WEB_ORIGIN: "http://example.com" },
    { WEB_ORIGIN: "https://example.com", COOKIE_SECURE: "false" }, { COOKIE_SECURE: "no" },
    { PORT: "0" }, { PORT: "3001.2" }, { ML_SERVICE_URL: "file:///secret" },
    { ML_SERVICE_URL: "http://user:pass@ml:5000" }]) {
    assert.throws(() => validateConfig({ ...base, ...overrides }));
  }
});

test("rate limit rejects overflow, ignores spoofed forwarded IPs, and recovers", async (t) => {
  let now = 0;
  const app = express();
  app.use(requestLimit(2, 1000, () => now));
  app.get("/", (_req, res) => { res.json({ ok: true }); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/`;
  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(url)).status, 200);
  const denied = await fetch(url, { headers: { "X-Forwarded-For": "203.0.113.1" } });
  assert.equal(denied.status, 429);
  assert.equal(denied.headers.get("retry-after"), "1");
  now = 1000;
  assert.equal((await fetch(url)).status, 200);
});
