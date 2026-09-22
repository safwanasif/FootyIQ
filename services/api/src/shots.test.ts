import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { createShotsRouter, shotGeometry, type SavedShot, type ShotStore } from "./shots";
import { MLServiceError } from "./services/ml.client";

test("geometry matches the pitch and is symmetric around goal center", () => {
  const center = shotGeometry(108, 40);
  assert.equal(center.distance_yards, 12);
  assert.ok(Math.abs(center.angle_degrees - 36.86989765) < 0.00001);
  assert.equal(shotGeometry(100, 20).distance_yards, shotGeometry(100, 60).distance_yards);
  assert.ok(Math.abs(shotGeometry(100, 20).angle_degrees - shotGeometry(100, 60).angle_degrees) < 1e-10);
  assert.ok(shotGeometry(119.9, 40).angle_degrees > 177);
});

test("shot API validates, saves, paginates, deduplicates retries and handles failures", async (t) => {
  const rows = new Map<string, SavedShot>();
  let dbFailed = false;
  let mlFailed = false;
  let calls = 0;
  const store: ShotStore = {
    async find(id) { if (dbFailed) throw new Error("private DB detail"); return rows.get(id); },
    async save(shot) {
      if (dbFailed) throw new Error("private DB detail");
      const saved = rows.get(shot.id) ?? { ...shot, created_at: new Date().toISOString() };
      rows.set(shot.id, saved);
      return saved;
    },
    async list(limit, offset) { if (dbFailed) throw new Error("private DB detail"); return [...rows.values()].reverse().slice(offset, offset + limit); },
  };
  const app = express();
  app.use(express.json());
  app.use(createShotsRouter(store, async (input) => {
    calls++;
    if (mlFailed) throw new MLServiceError("private ML detail", 503);
    assert.ok(input.distance_meters > 0);
    return { xg_probability: 0.142, distance_yards: input.distance_meters * 1.09361, interpretation: "Moderate probability effort" };
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (body: unknown) => fetch(`${base}/shots`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.deepEqual(await (await fetch(`${base}/shots`)).json(), { shots: [], has_more: false });
  for (const invalid of [{}, { id: randomUUID(), x: 120, y: 40 }, { id: randomUUID(), x: 108, y: -1 }, { id: randomUUID(), x: "108", y: 40 }, { id: randomUUID(), x: 108, y: 40, xg_probability: 1 }]) {
    assert.equal((await post(invalid)).status, 422);
  }
  assert.equal(calls, 0);
  const shot = { id: randomUUID(), x: 108, y: 40 };
  const first = await post(shot);
  assert.equal(first.status, 201);
  const saved = await first.json() as SavedShot;
  assert.equal(saved.distance_yards, 12);
  assert.equal(saved.xg_probability, 0.142);
  assert.equal((await post(shot)).status, 200);
  assert.equal(rows.size, 1);
  assert.equal(calls, 1);
  assert.equal((await post({ ...shot, y: 41 })).status, 409);
  await post({ id: randomUUID(), x: 90, y: 20 });
  const page = await (await fetch(`${base}/shots?limit=1`)).json() as { shots: SavedShot[]; has_more: boolean };
  assert.equal(page.shots.length, 1);
  assert.equal(page.has_more, true);
  const secondPage = await (await fetch(`${base}/shots?limit=1&offset=1`)).json() as { shots: SavedShot[] };
  assert.equal(secondPage.shots[0].id, shot.id);
  for (const query of ["limit=0", "limit=51", "offset=-1", "limit=nope"]) {
    assert.equal((await fetch(`${base}/shots?${query}`)).status, 422);
  }
  mlFailed = true;
  assert.equal((await post({ id: randomUUID(), x: 100, y: 40 })).status, 503);
  assert.equal(rows.size, 2);
  assert.equal((await post(shot)).status, 200); // Retry succeeds even while ML is offline.
  dbFailed = true;
  assert.equal((await fetch(`${base}/shots`)).status, 503);
  const failed = await post({ id: randomUUID(), x: 100, y: 40 });
  assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes("private"));
});
