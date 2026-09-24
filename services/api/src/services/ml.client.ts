import { distanceSupport } from "../distance-support";
import axios from "axios";
import { z } from "zod";
import type { ShotInput } from "../schemas/shot.schema";

const PREDICT_ENDPOINT = `${(process.env.ML_SERVICE_URL || "http://localhost:5000").replace(/\/+$/, "")}/api/v1/predict`;
const predictionSchema = z.object({
  xg_probability: z.number().finite().min(0).max(1),
  distance_yards: z.number().finite().min(0),
  interpretation: z.string().trim().min(1).max(200),
  model_id: z.string().regex(/^[a-z][a-z0-9._-]{0,79}$/),
});
export type XGResponse = z.infer<typeof predictionSchema>;

export class MLServiceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "MLServiceError";
  }
}

export function validatePrediction(data: unknown, shot: ShotInput): XGResponse {
  const parsed = predictionSchema.safeParse(data);
  // The inference service rounds yards to four decimals.
  if (!parsed.success || parsed.data.model_id !== "context-boosted-30k-v1" || Math.abs(parsed.data.distance_yards - shot.distance_meters * 1.09361) > 0.000051) {
    throw new MLServiceError("The prediction service returned an invalid result.", 502);
  }
  return parsed.data;
}

export async function getXGPrediction(shot: ShotInput): Promise<XGResponse> {
  const unsupported = distanceSupport(shot.distance_meters * 1.09361, shot.context);
  if (unsupported) throw new MLServiceError(unsupported, 422);
  try {
    const response = await axios.post<unknown>(PREDICT_ENDPOINT, shot, {
      timeout: 5000, maxContentLength: 16384, maxRedirects: 0,
      headers: { "Content-Type": "application/json" },
    });
    return validatePrediction(response.data, shot);
  } catch (error) {
    const upstream = axios.isAxiosError(error) ? error : undefined;
    // Never log upstream bodies, credentials, or connection URLs.
    console.error("ML prediction failed", {
      category: error instanceof MLServiceError ? "invalid_response" : "request_failed",
      code: upstream?.code, status: upstream?.response?.status,
    });
    if (error instanceof MLServiceError) throw error;
    const unavailable = upstream?.request && !upstream.response;
    throw new MLServiceError(unavailable
      ? "The prediction service is temporarily unavailable. Please retry."
      : "The prediction service could not complete the request.", unavailable ? 503 : 502);
  }
}
