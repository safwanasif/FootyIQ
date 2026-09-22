import { Pool } from "pg";
import type { SavedShot, ShotStore } from "./shots";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 3000, query_timeout: 5000, statement_timeout: 5000, max: 10,
});
pool.on("error", (error) => console.error("Idle database connection failed:", error.message));

// Applies to existing volumes as well as fresh installations.
export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(724019)");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY)");
    const applied = await client.query("SELECT version FROM schema_migrations WHERE version = 1");
    if (!applied.rowCount) {
      await client.query(`CREATE TABLE shots (
        id uuid PRIMARY KEY,
        x double precision NOT NULL CHECK (x >= 60 AND x <= 119.9),
        y double precision NOT NULL CHECK (y >= 0 AND y <= 80),
        distance_yards double precision NOT NULL CHECK (distance_yards > 0 AND distance_yards < 100),
        angle_degrees double precision NOT NULL CHECK (angle_degrees >= 0 AND angle_degrees <= 180),
        xg_probability double precision NOT NULL CHECK (xg_probability >= 0 AND xg_probability <= 1),
        interpretation text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
      await client.query("CREATE INDEX shots_recent ON shots (created_at DESC, id DESC)");
      await client.query("INSERT INTO schema_migrations (version) VALUES (1)");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
export const shotStore: ShotStore = {
  async find(id) {
    return (await pool.query<SavedShot>("SELECT * FROM shots WHERE id = $1", [id])).rows[0];
  },
  async save(shot) {
    const result = await pool.query<SavedShot>(`INSERT INTO shots
      (id, x, y, distance_yards, angle_degrees, xg_probability, interpretation)
      VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING RETURNING *`,
      [shot.id, shot.x, shot.y, shot.distance_yards, shot.angle_degrees, shot.xg_probability, shot.interpretation]);
    return result.rows[0] ?? (await this.find(shot.id))!;
  },
  async list(limit, offset) {
    return (await pool.query<SavedShot>("SELECT * FROM shots ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2", [limit, offset])).rows;
  },
};
