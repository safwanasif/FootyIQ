import contract from "./shot-context.json";
export type ShotContext = typeof contract.defaults;
export const defaultContext: ShotContext = contract.defaults;
import evidence from "./model-evidence.json";
/**
 * ============================================================================
 * FootyIQ Web — API Gateway Client (lib/api.ts)
 * ============================================================================
 * PURPOSE:
 *   Single point of contact between the frontend and services/api (Express
 *   Gateway). Enforces the Gateway Pattern — this file is the ONLY place
 *   fetch() targets the backend; components never construct URLs directly.
 *
 * ERROR MODEL:
 *   All failures — network unreachable, non-2xx responses, malformed JSON —
 *   are normalized into ApiError so calling components handle one shape,
 *   not three different failure modes.
 * ============================================================================
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_MODE === "same-origin" ? "" : process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

let collectionRequest: Promise<{ collection_id: string }> | null = null;
function openCollection() {
  if (!collectionRequest) {
    collectionRequest = fetch(`${BASE_URL}/api/v1/session`, {
      credentials: "include", cache: "no-store", signal: AbortSignal.timeout(10000),
    }).then(async (response) => {
      if (!response.ok) throw new ApiError("Unable to open your browser collection.", response.status);
      return response.json() as Promise<{ collection_id: string }>;
    }).catch((error) => { collectionRequest = null; throw error; });
  }
  return collectionRequest;
}

if (!process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_MODE !== "same-origin") {
  // Loud warning rather than a silent fallback — catches a missing
  // .env.local immediately instead of mysterious runtime fetch failures.
  console.warn(
    "NEXT_PUBLIC_API_URL is not set — falling back to http://localhost:3001."
  );
}

// ----------------------------------------------------------------------------
// RESPONSE SHAPES (mirrors services/api's XGResponse / health payload)
// ----------------------------------------------------------------------------
export interface PredictionResponse {
  xg_probability: number;
  distance_yards: number;
  interpretation: string;
  model_id: string;
}

export interface HealthResponse {
  status: string;
  service: string;
}

// ----------------------------------------------------------------------------
// NORMALIZED ERROR TYPE
// ----------------------------------------------------------------------------
export class ApiError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * GET /health — pings the Express Gateway. Used for the nav bar's live
 * system status indicator. Never throws for a "down" gateway in a way that
 * crashes the caller — callers catch ApiError and render an offline state.
 */
export async function checkHealth(signal?: AbortSignal): Promise<HealthResponse> {
  try {
    const res = await fetch(`${BASE_URL}/health`, { cache: "no-store", signal });
    if (!res.ok) {
      throw new ApiError(`Gateway health check returned ${res.status}`, res.status);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // fetch() throws a generic TypeError on network failure (offline
    // container, DNS failure, refused connection) — normalize it to 503.
    throw new ApiError("Gateway unreachable", 503);
  }
}

/**
 * POST /api/v1/predict-proxy — the core xG inference call.
 *
 * @param distanceMeters - shot distance to goal, in meters
 * @param angleDegrees   - shot angle subtended by the goalposts, in degrees
 */
export async function getXgPrediction(
  distanceMeters: number,
  angleDegrees: number,
  signal?: AbortSignal,
  context: ShotContext = defaultContext
): Promise<PredictionResponse> {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/predict-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        distance_meters: distanceMeters,
        angle_degrees: angleDegrees,
        context,
      }),
      signal,
    });

    if (!res.ok) {
      // Attempt to surface the Gateway's structured error message
      // (Zod validation details or the 502/503 relay from ml.client.ts).
      const body = await res.json().catch(() => ({}));
      throw new ApiError(
        body?.message || body?.error || `Prediction request failed (${res.status})`,
        res.status
      );
    }

    const prediction = await res.json() as PredictionResponse;
    if (prediction.model_id !== evidence.serving.id) {
      throw new ApiError("The prediction service and model evidence are out of sync. Please retry after the service update.", 503);
    }
    return prediction;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("Unable to reach the FootyIQ API Gateway.", 503);
  }
}

export interface SavedShot extends PredictionResponse {
  context: ShotContext | null;
  id: string;
  x: number;
  y: number;
  angle_degrees: number;
  created_at: string;
}

async function shotRequest<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    await openCollection();
    const request = () => fetch(`${BASE_URL}/api/v1/shots${path}`, {
      ...options, credentials: "include", cache: "no-store",
      signal: options?.signal ?? AbortSignal.timeout(15000),
    });
    let res = await request();
    if (res.status === 401) {
      collectionRequest = null;
      await openCollection();
      res = await request();
    }
    const body = await res.json();
    if (!res.ok) throw new ApiError(body.error || "Shot request failed", res.status);
    return body;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Unable to reach shot history. Please retry.", 503);
  }
}

export async function listShots(offset: number, signal?: AbortSignal) {
  const result = await shotRequest<{ shots: SavedShot[]; has_more: boolean }>(`?limit=10&offset=${offset}`, { signal });
  return { ...result, collection_id: (await openCollection()).collection_id };
}

export function shotExportUrl(offset: number) {
  return `${BASE_URL}/api/v1/shots/export?offset=${offset}`;
}

export function saveShot(shot: { id: string; x: number; y: number; context: ShotContext }) {
  return shotRequest<SavedShot>("", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(shot),
  });
}
