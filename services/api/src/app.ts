import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { predictRouter } from "./routes/predict.route";
import { createShotsRouter, type ShotStore } from "./shots";
import { openCollection } from "./collection";
import { requestLimit } from "./rate-limit";

export function createApp(store: ShotStore, checkDatabase: () => Promise<unknown>, options: {
  webOrigin?: string; secureCookies?: boolean;
} = {}) {
  const app = express();
  const origin = options.webOrigin ?? process.env.WEB_ORIGIN ?? "http://localhost:3000";
  const secureCookies = options.secureCookies ?? process.env.COOKIE_SECURE !== "false";
  app.disable("x-powered-by");
  app.use(cors({ origin, credentials: true }));
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Enforce origins on the server as well as through browser CORS behavior.
    if (req.headers.origin && req.headers.origin !== origin) {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }
    next();
  });
  app.use("/api/v1/session", requestLimit(30));
  app.use("/api/v1/predict-proxy", requestLimit(240));
  const saveLimit = requestLimit(60);
  const readLimit = requestLimit(120);
  app.use("/api/v1/shots", (req, res, next) => (req.method === "POST" ? saveLimit : readLimit)(req, res, next));
  app.use(express.json({ limit: "16kb" }));
  app.get("/health", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      await checkDatabase();
      res.json({ status: "ok", service: "footyiq-api-gateway", database: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable", service: "footyiq-api-gateway", database: "unavailable" });
    }
  });
  app.get("/api/v1/session", openCollection(secureCookies));
  app.use("/api/v1", predictRouter, createShotsRouter(store));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error.type === "entity.parse.failed" ? 400 : error.type === "entity.too.large" ? 413 : 500;
    res.status(status).json({ error: status === 400 ? "Invalid JSON" : status === 413 ? "Request too large" : "Internal server error" });
  };
  app.use(errorHandler);
  return app;
}
