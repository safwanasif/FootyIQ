import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { predictRouter } from "./routes/predict.route";
import { createShotsRouter } from "./shots";
import { migrate, pool, shotStore } from "./database";

const app = express();
app.use(cors({ origin: process.env.WEB_ORIGIN || "http://localhost:3000" }));
app.use(express.json({ limit: "16kb" }));
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "footyiq-api-gateway", database: "ok" });
  } catch {
    res.status(503).json({ status: "unavailable", service: "footyiq-api-gateway", database: "unavailable" });
  }
});
app.use("/api/v1", predictRouter, createShotsRouter(shotStore));
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = error.type === "entity.parse.failed" ? 400 : error.type === "entity.too.large" ? 413 : 500;
  res.status(status).json({ error: status === 400 ? "Invalid JSON" : status === 413 ? "Request too large" : "Internal server error" });
};
app.use(errorHandler);

async function start() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. See services/api/.env.example.");
  await migrate();
  const server = app.listen(process.env.PORT || 3001, () => console.log("FootyIQ API ready; database migrations applied."));
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
