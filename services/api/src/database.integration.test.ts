import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { shotGeometry } from "./shots";
import { getXGPrediction } from "./services/ml.client";

test("PostgreSQL migrations, real ML prediction, concurrent retries and persistence", async () => {
  assert.ok(process.env.DATABASE_URL, "Set DATABASE_URL to run integration tests");
  const schema = `test_shots_${randomUUID().replace(/-/g, "")}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const connection = new URL(process.env.DATABASE_URL);
  connection.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = connection.toString();
  const { migrate, pool, shotStore } = await import("./database.js");
  try {
    await migrate();
    await migrate();
    assert.equal((await pool.query("SELECT * FROM schema_migrations")).rowCount, 1);
    const geometry = shotGeometry(108, 40);
    const prediction = await getXGPrediction({ distance_meters: geometry.distance_meters, angle_degrees: geometry.angle_degrees });
    assert.ok(prediction.xg_probability >= 0 && prediction.xg_probability <= 1);
    const shot = { id: randomUUID(), x: 108, y: 40, ...prediction, distance_yards: geometry.distance_yards, angle_degrees: geometry.angle_degrees };
    const [first, retry] = await Promise.all([shotStore.save(shot), shotStore.save(shot)]);
    assert.equal(first.id, retry.id);
    assert.equal((await shotStore.list(11, 0)).length, 1);
    assert.equal((await shotStore.find(shot.id))?.distance_yards, 12);
    await assert.rejects(pool.query("UPDATE shots SET xg_probability = 2 WHERE id = $1", [shot.id]));
    // Read through a separate connection, proving the write was committed.
    const reconnect = new Pool({ connectionString: connection.toString() });
    try {
      assert.equal((await reconnect.query("SELECT id FROM shots")).rows[0].id, shot.id);
    } finally { await reconnect.end(); }
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});
