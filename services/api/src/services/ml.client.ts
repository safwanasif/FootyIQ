/**
 * ============================================================================
 * FootyIQ API Gateway — ML Microservice HTTP Client (ml.client.ts)
 * ============================================================================
 * PURPOSE:
 *   Thin HTTP client responsible for calling the Dockerized Python FastAPI
 *   ML microservice (services/ml/app.py) at POST /api/v1/predict.
 *
 *   This is the ONLY file in the API gateway that knows about the ML
 *   service's network location and response shape — isolating that
 *   coupling to a single module.
 * ============================================================================
 */

import axios, { AxiosError } from "axios";
import type { ShotInput } from "../schemas/shot.schema";

// ----------------------------------------------------------------------------
// ML service base URL, read from environment with a safe local-dev default.
// In Phase 2b's docker-compose.yml, this becomes http://ml:5000 (Docker
// service-name DNS) instead of localhost — swap via .env, not code changes.
// ----------------------------------------------------------------------------
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:5000";
const PREDICT_ENDPOINT = `${ML_SERVICE_URL}/api/v1/predict`;

// ----------------------------------------------------------------------------
// Shape of the response returned by the Python FastAPI service's
// XGResponse Pydantic model. Mirrored here for type-safe consumption.
// ----------------------------------------------------------------------------
export interface XGResponse {
  xg_probability: number;
  distance_yards: number;
  interpretation: string;
}

// ----------------------------------------------------------------------------
// Custom error type so route handlers can distinguish "the ML service is
// unreachable / errored" from other kinds of failures, and respond with
// the correct HTTP status (502 vs 503) accordingly.
// ----------------------------------------------------------------------------
export class MLServiceError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "MLServiceError";
    this.statusCode = statusCode;
  }
}

/**
 * Calls the Python ML microservice's /api/v1/predict endpoint.
 *
 * Defensive design:
 *   - A short timeout (5s) prevents the gateway from hanging indefinitely
 *     if the ML container is unresponsive.
 *   - Network-level failures (container offline, connection refused,
 *     timeout) are mapped to a 503 (Service Unavailable) — the DOWNSTREAM
 *     dependency is down, not the gateway itself.
 *   - Non-2xx responses FROM the ML service (e.g., its own validation
 *     errors) are mapped to a 502 (Bad Gateway) — the upstream service
 *     responded, but with an error we're relaying.
 *
 * @param shot - Validated shot input (already passed through Zod).
 * @returns The ML service's xG prediction.
 * @throws MLServiceError if the ML service is unreachable or errors.
 */
export async function getXGPrediction(shot: ShotInput): Promise<XGResponse> {
  try {
    const response = await axios.post<XGResponse>(PREDICT_ENDPOINT, shot, {
      timeout: 5000,
      headers: { "Content-Type": "application/json" },
    });

    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;

    if (axiosError.response) {
      // ML service responded, but with a non-2xx status (e.g., its own
      // Pydantic validation failure, or a 503 if ITS model isn't loaded).
      throw new MLServiceError(
        `ML service returned an error: ${axiosError.response.status} ${JSON.stringify(
          axiosError.response.data
        )}`,
        502
      );
    }

    if (axiosError.request) {
      // Request was sent but no response came back — container offline,
      // wrong port, connection refused, or timeout.
      throw new MLServiceError(
        `ML service is unreachable at ${PREDICT_ENDPOINT}. Is the Docker container running?`,
        503
      );
    }

    // Unexpected error building the request itself.
    throw new MLServiceError(
      `Unexpected error calling ML service: ${(error as Error).message}`,
      502
    );
  }
}