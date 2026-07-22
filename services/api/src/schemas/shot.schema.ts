/**
 * ============================================================================
 * FootyIQ API Gateway — Shot Input Validation Schema (shot.schema.ts)
 * ============================================================================
 * PURPOSE:
 *   Defines the Zod schema for incoming shot prediction requests. This is
 *   the TypeScript/Node mirror of the Python microservice's Pydantic
 *   `ShotInput` model (services/ml/app.py) — the two MUST stay in sync,
 *   since this gateway validates BEFORE forwarding to the ML service.
 *
 * CONTRACT PARITY (must match services/ml/app.py::ShotInput):
 *   - distance_meters: number, > 0
 *   - angle_degrees:   number, 0 <= x <= 180
 *
 * ZOD v4 NOTE:
 *   `required_error` / `invalid_type_error` were removed from the base
 *   schema constructor in Zod v4 and replaced by a single unified `error`
 *   param, which can be a plain string or a function that inspects the
 *   issue to distinguish "missing" vs "wrong type" cases.
 * ============================================================================
 */

import { z } from "zod";

// ----------------------------------------------------------------------------
// ShotInputSchema
// ----------------------------------------------------------------------------
// Zod v4 schema mirroring the FastAPI Pydantic contract exactly. Using
// `.positive()` for distance (strictly > 0, matching Pydantic's gt=0) and
// `.min(0).max(180)` for angle (inclusive bounds, matching Pydantic's
// ge=0, le=180).
export const ShotInputSchema = z.object({
  distance_meters: z
    .number({
      error: (issue) =>
        issue.input === undefined
          ? "distance_meters is required"
          : "distance_meters must be a number",
    })
    .positive("distance_meters must be greater than 0"),

  angle_degrees: z
    .number({
      error: (issue) =>
        issue.input === undefined
          ? "angle_degrees is required"
          : "angle_degrees must be a number",
    })
    .min(0, "angle_degrees must be >= 0")
    .max(180, "angle_degrees must be <= 180"),
});

// ----------------------------------------------------------------------------
// Inferred TypeScript type — derived directly from the Zod schema so the
// type and the runtime validator can never drift apart.
// ----------------------------------------------------------------------------
export type ShotInput = z.infer<typeof ShotInputSchema>;