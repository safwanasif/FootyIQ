import "dotenv/config";
import { pool, migrate, importLegacyShots } from "./database";

async function claim() {
  const collectionId = process.argv[2];
  if (!collectionId || !/^[a-f0-9]{64}$/.test(collectionId)) {
    throw new Error("Pass the collection ID shown under 'About your browser collection'.");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  await migrate();
  const imported = await importLegacyShots(collectionId);
  console.log(`Imported ${imported} older shots. No existing collection records were changed.`);
}
void claim().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
