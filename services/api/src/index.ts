import "dotenv/config";
import { createApp } from "./app";
import { migrate, pool, shotStore } from "./database";

import { validateConfig } from "./config";
async function start() {
  const config = validateConfig(process.env);
  const app = createApp(shotStore, () => pool.query("SELECT 1"), config);
  await migrate();
  const server = app.listen(config.port, () => console.log("FootyIQ API ready; database migrations applied."));
  const shutdown = () => {
    server.close(() => { void pool.end().then(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
void start().catch(async (error) => {
  console.error("API startup failed:", error.message);
  await pool.end();
  process.exitCode = 1;
});
