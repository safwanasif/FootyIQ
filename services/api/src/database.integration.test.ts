import { defaultContext } from "./schemas/shot.schema";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { shotGeometry, type SavedShot } from "./shots";
import { getXGPrediction } from "./services/ml.client";
import { createApp } from "./app";

// Uses a temporary schema, leaving local browser collections untouched.
test("upgrade, real ML saves, concurrent retries and two-visitor HTTP isolation", async () => {
  assert.ok(process.env.DATABASE_URL, "Set DATABASE_URL to run integration tests");
  const schema = `test_shots_${randomUUID().replace(/-/g, "")}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const connection = new URL(process.env.DATABASE_URL);
  connection.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = connection.toString();
  const { migrate, pool, shotStore, importLegacyShots } = await import("./database.js");
  const legacyId = randomUUID();
  try {
    // Seed the previous schema to verify upgrading never exposes or deletes old shots.
    await pool.query("CREATE TABLE schema_migrations (version integer PRIMARY KEY)");
    await pool.query("INSERT INTO schema_migrations VALUES (1)");
    await pool.query(`CREATE TABLE shots (
      id uuid PRIMARY KEY, x double precision NOT NULL, y double precision NOT NULL,
      distance_yards double precision NOT NULL, angle_degrees double precision NOT NULL,
      xg_probability double precision NOT NULL CHECK (xg_probability >= 0 AND xg_probability <= 1),
      interpretation text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await pool.query("INSERT INTO shots VALUES ($1, 108, 40, 12, 37, 0.14, 'Legacy shot', now())", [legacyId]);
    await migrate();
    await migrate();
    assert.equal((await pool.query("SELECT * FROM schema_migrations")).rowCount, 4);
    assert.equal((await pool.query("SELECT id FROM shots WHERE collection_id IS NULL")).rows[0].id, legacyId);
    assert.equal((await pool.query("SELECT model_id FROM shots WHERE id = $1", [legacyId])).rows[0].model_id, "legacy-unversioned");
    const owner = "a".repeat(64);
    const geometry = shotGeometry(108, 40);
    const prediction = await getXGPrediction({ distance_meters: geometry.distance_meters, angle_degrees: geometry.angle_degrees });
    assert.ok(prediction.xg_probability >= 0 && prediction.xg_probability <= 1);
    const shot = { context: defaultContext, id: randomUUID(), x: 108, y: 40, ...prediction, distance_yards: geometry.distance_yards, angle_degrees: geometry.angle_degrees };
    const [first, retry] = await Promise.all([shotStore.save(owner, shot), shotStore.save(owner, shot)]);
    assert.equal(first.id, retry.id);
    assert.equal(first.model_id, "context-boosted-30k-v1");
    assert.equal(retry.model_id, first.model_id);
    assert.deepEqual(first.context, defaultContext);
    assert.equal((await pool.query("SELECT context FROM shots WHERE id = $1", [legacyId])).rows[0].context, null);
    assert.equal((await shotStore.list(owner, 11, 0)).length, 1);
    assert.equal(await shotStore.find("b".repeat(64), shot.id), undefined);
    assert.equal((await shotStore.find(owner, shot.id))?.distance_yards, 12);
    assert.ok(!("collection_id" in first));
    await assert.rejects(pool.query("UPDATE shots SET xg_probability = 2 WHERE id = $1", [shot.id]));

    const app = createApp(shotStore, () => pool.query("SELECT 1"), { secureCookies: false });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const base = `http://127.0.0.1:${address.port}/api/v1`;
      const session = async () => {
        const response = await fetch(`${base}/session`);
        return response.headers.get("set-cookie")!.split(";")[0];
      };
      const a = await session();
      const b = await session();
      assert.notEqual(a, b);
      const list = async (cookie: string) => (await (await fetch(`${base}/shots`, { headers: { Cookie: cookie } })).json()) as { shots: SavedShot[] };
      const post = (cookie: string, body: object) => fetch(`${base}/shots`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      assert.equal((await list(a)).shots.length, 0);
      const id = randomUUID();
      assert.equal((await post(a, { id, x: 108, y: 40 })).status, 201);
      assert.equal((await post(a, { id, x: 108, y: 40 })).status, 200);
      assert.equal((await list(a)).shots.length, 1);
      assert.equal((await list(b)).shots.length, 0);
      const exportB = await (await fetch(`${base}/shots/export`, { headers: { Cookie: b } })).text();
      assert.ok(!exportB.includes(id));
      assert.ok(!exportB.includes(legacyId));
      // Knowing another visitor's save ID grants no access and causes no global collision.
      assert.equal((await post(b, { id, x: 90, y: 20 })).status, 201);
      assert.equal((await list(b)).shots[0].x, 90);
      assert.equal((await list(a)).shots[0].x, 108);
      const exportA = await fetch(`${base}/shots/export`, { headers: { Cookie: a } });
      assert.equal(exportA.status, 200);
      assert.equal((await exportA.text()).trim().split("\r\n").length, 2);
    } finally {
      await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); });
    }
    const reconnect = new Pool({ connectionString: connection.toString() });
    try { assert.equal((await reconnect.query("SELECT id FROM shots WHERE collection_id = $1", [owner])).rows[0].id, shot.id); }
    finally { await reconnect.end(); }
    // The operator import preserves owned records and skips a colliding legacy ID.
    await pool.query("INSERT INTO shots (id, x, y, distance_yards, angle_degrees, xg_probability, interpretation) VALUES ($1, 90, 40, 30, 15, 0.02, 'Conflicting legacy shot')", [shot.id]);
    assert.equal(await importLegacyShots(owner), 1);
    assert.equal(await importLegacyShots(owner), 0);
    assert.equal((await shotStore.find(owner, legacyId))?.interpretation, "Legacy shot");
    assert.equal((await shotStore.find(owner, shot.id))?.x, 108);
    assert.equal((await pool.query("SELECT id FROM shots WHERE collection_id IS NULL")).rows[0].id, shot.id);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});
