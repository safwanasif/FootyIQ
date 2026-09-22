import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app";

test("collections use private cookies and reject cross-origin requests", async (t) => {
  const app = createApp({
    async find() { return undefined; },
    async save() { throw new Error("not used"); },
    async list() { return []; },
  }, async () => {}, { webOrigin: "http://localhost:3000", secureCookies: true });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  const first = await fetch(`${base}/session`, { headers: { Origin: "http://localhost:3000" } });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("access-control-allow-credentials"), "true");
  assert.equal(first.headers.get("cache-control"), "no-store");
  const setCookie = first.headers.get("set-cookie")!;
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Path=\/api\/v1/);
  const cookie = setCookie.split(";")[0];
  const payload = await first.json() as { collection_id: string };
  assert.match(payload.collection_id, /^[a-f0-9]{64}$/);
  assert.notEqual(payload.collection_id, cookie.split("=")[1]);
  const again = await fetch(`${base}/session`, { headers: { Cookie: cookie } });
  assert.deepEqual(await again.json(), payload);
  assert.equal((await fetch(`${base}/shots`, { headers: { Cookie: cookie } })).status, 200);
  for (const value of ["", "footyiq_collection=bad", `${cookie}; ${cookie}`]) {
    assert.equal((await fetch(`${base}/shots`, { headers: { Cookie: value } })).status, 401);
  }
  assert.equal((await fetch(`${base}/session`, { headers: { Origin: "https://untrusted.example" } })).status, 403);
  assert.equal((await fetch(`${base}/shots`, { method: "POST", headers: { Cookie: cookie, Origin: "https://untrusted.example", "Content-Type": "application/json" }, body: "{}" })).status, 403);
});
