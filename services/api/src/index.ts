/**
 * ============================================================================
 * FootyIQ API Gateway — Express Server Entry Point (index.ts)
 * ============================================================================
 * PURPOSE:
 *   Bootstraps the Express application: middleware (CORS, JSON parsing),
 *   route mounting, and server startup. This service is the API gateway
 *   between the future React frontend (apps/web) and the Python ML
 *   microservice (services/ml) — it never talks to Postgres directly in
 *   this phase; that comes with packages/db integration later.
 *
 * PORT:
 *   Bound to 3001 to avoid clashing with Next.js (3000) and FastAPI (5000).
 *
 * USAGE:
 *   npm run dev
 * ============================================================================
 */

import express, { Express, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { predictRouter } from "./routes/predict.route";

// ----------------------------------------------------------------------------
// Load environment variables from .env before anything else references them
// (ml.client.ts reads process.env.ML_SERVICE_URL at call time, so this must
// run first).
// ----------------------------------------------------------------------------
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3001;

// ----------------------------------------------------------------------------
// MIDDLEWARE
// ----------------------------------------------------------------------------
// CORS: Allows the future React frontend (different origin/port) to call
// this API. Wide open for local dev; restrict to specific origins in Phase 3.
app.use(cors());

// JSON body parsing: Required for req.body to be populated on POST requests.
app.use(express.json());

// ----------------------------------------------------------------------------
// HEALTH CHECK
// ----------------------------------------------------------------------------
// GET /health — confirms the gateway itself is alive. Does NOT check
// downstream ML service health; that's what predict-proxy's error handling
// surfaces on-demand via 503.
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "footyiq-api-gateway" });
});

// ----------------------------------------------------------------------------
// ROUTE MOUNTING
// ----------------------------------------------------------------------------
// All prediction-related routes live under /api/v1
app.use("/api/v1", predictRouter);

// ----------------------------------------------------------------------------
// SERVER STARTUP
// ----------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`FootyIQ API Gateway running at http://localhost:${PORT}`);
  console.log(`  Health check:     GET  http://localhost:${PORT}/health`);
  console.log(`  Predict (proxy):  POST http://localhost:${PORT}/api/v1/predict-proxy`);
  console.log(`  Forwarding to ML: ${process.env.ML_SERVICE_URL || "http://localhost:5000"}`);
});