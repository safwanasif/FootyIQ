export function validateConfig(env: NodeJS.ProcessEnv) {
  const origin = env.WEB_ORIGIN ?? "http://localhost:3000";
  let web: URL;
  try { web = new URL(origin); } catch { throw new Error("WEB_ORIGIN must be an HTTP(S) origin"); }
  if (!["http:", "https:"].includes(web.protocol) || web.origin !== origin) {
    throw new Error("WEB_ORIGIN must be an exact HTTP(S) origin without a path");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(web.hostname);
  if (env.COOKIE_SECURE !== undefined && !["true", "false"].includes(env.COOKIE_SECURE)) {
    throw new Error("COOKIE_SECURE must be true or false");
  }
  const secureCookies = env.COOKIE_SECURE !== "false";
  if (!local && (web.protocol !== "https:" || !secureCookies)) {
    throw new Error("Public frontend origins require HTTPS and secure cookies");
  }
  let database: URL;
  try { database = new URL(env.DATABASE_URL ?? ""); } catch { throw new Error("DATABASE_URL must be a PostgreSQL connection URL"); }
  if (!["postgres:", "postgresql:"].includes(database.protocol) || !database.hostname || database.pathname.length < 2) {
    throw new Error("DATABASE_URL requires a PostgreSQL host and database name");
  }
  let ml: URL;
  try { ml = new URL(env.ML_SERVICE_URL ?? "http://localhost:5000"); } catch { throw new Error("ML_SERVICE_URL must be an HTTP(S) origin"); }
  if (!["http:", "https:"].includes(ml.protocol) || ml.username || ml.password || ml.search || ml.hash || ml.pathname !== "/") {
    throw new Error("ML_SERVICE_URL must be an HTTP(S) origin without credentials or a path");
  }
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer from 1 to 65535");
  return { webOrigin: origin, secureCookies, port };
}
