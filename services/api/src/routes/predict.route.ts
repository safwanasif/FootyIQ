/**
 * ============================================================================
 * FootyIQ API Gateway — Predict Proxy Route (predict.route.ts)
 * ============================================================================
 * PURPOSE:
 *   Exposes POST /api/v1/predict-proxy. Validates the incoming request
 *   against ShotInputSchema (Zod), then forwards it to the Python ML
 *   microservice via ml.client.ts, and relays the result back to the
 *   caller (e.g., the future React frontend).
 * ============================================================================
 */

import { Router, Request, Response } from "express";
import { ShotInputSchema } from "../schemas/shot.schema";
import { getXGPrediction, MLServiceError } from "../services/ml.client";

export const predictRouter = Router();

// ----------------------------------------------------------------------------
// POST /api/v1/predict-proxy
// ----------------------------------------------------------------------------
predictRouter.post("/predict-proxy", async (req: Request, res: Response) => {
  // --- STEP 1: Validate request body against the Zod schema ---
  const parseResult = ShotInputSchema.safeParse(req.body);

  if (!parseResult.success) {
    // Zod validation failed — mirror FastAPI's 422 semantics for a
    // client-side input error, with structured field-level detail.
    return res.status(422).json({
      error: "Validation failed",
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const shot = parseResult.data;

  // --- STEP 2: Forward validated payload to the ML microservice ---
  try {
    const prediction = await getXGPrediction(shot);
    return res.status(200).json(prediction);
  } catch (error) {
    // --- STEP 3: Defensive error handling — never let this crash the process ---
    if (error instanceof MLServiceError) {
      return res.status(error.statusCode).json({
        error: "ML service error",
        message: error.message,
      });
    }

    // Truly unexpected error — log server-side, return generic 500 to caller.
    console.error("Unexpected error in predict-proxy route:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: "An unexpected error occurred while processing the prediction.",
    });
  }
});