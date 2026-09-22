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
    const collections = await client.query("SELECT version FROM schema_migrations WHERE version = 2");
    if (!collections.rowCount) {
      // NULL owners preserve pre-collection shots, but are invisible to visitor queries.
      await client.query("ALTER TABLE shots ADD COLUMN collection_id text CHECK (collection_id ~ '^[a-f0-9]{64}$')");
      await client.query("ALTER TABLE shots DROP CONSTRAINT shots_pkey");
      await client.query("ALTER TABLE shots ADD COLUMN storage_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY");
      await client.query("CREATE UNIQUE INDEX shots_collection_idempotency ON shots (collection_id, id)");
      await client.query("CREATE INDEX shots_collection_recent ON shots (collection_id, created_at DESC, id DESC)");
      await client.query("INSERT INTO schema_migrations (version) VALUES (2)");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
const PUBLIC_COLUMNS = "id, x, y, distance_yards, angle_degrees, xg_probability, interpretation, created_at";
export async function importLegacyShots(collectionId: string) {
  if (!/^[a-f0-9]{64}$/.test(collectionId)) throw new Error("Invalid collection ID");
  const result = await pool.query(`UPDATE shots AS legacy SET collection_id = $1
    WHERE legacy.collection_id IS NULL AND NOT EXISTS (
      SELECT 1 FROM shots AS owned WHERE owned.collection_id = $1 AND owned.id = legacy.id
    )`, [collectionId]);
  return result.rowCount;
}

export const shotStore: ShotStore = {
  async find(collectionId, id) {
    return (await pool.query<SavedShot>(`SELECT ${PUBLIC_COLUMNS} FROM shots WHERE collection_id = $1 AND id = $2`, [collectionId, id])).rows[0];
  },
  async save(collectionId, shot) {
    const result = await pool.query<SavedShot>(`INSERT INTO shots
      (id, x, y, distance_yards, angle_degrees, xg_probability, interpretation, collection_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (collection_id, id) DO NOTHING RETURNING ${PUBLIC_COLUMNS}`,
      [shot.id, shot.x, shot.y, shot.distance_yards, shot.angle_degrees, shot.xg_probability, shot.interpretation, collectionId]);
    return result.rows[0] ?? (await this.find(collectionId, shot.id))!;
  },
  async list(collectionId, limit, offset) {
    return (await pool.query<SavedShot>(`SELECT ${PUBLIC_COLUMNS} FROM shots WHERE collection_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`, [collectionId, limit, offset])).rows;
  },
};
