import { distanceSupport } from "./distance-support";
import { defaultContext } from "./schemas/shot.schema";
import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePrediction, MLServiceError } from "./services/ml.client";

test("ML boundary rejects invalid probabilities, geometry and text", () => {
  const shot = { distance_meters: 11, angle_degrees: 37 };
  const valid = { xg_probability: .142, distance_yards: 12.0297, model_id: "context-boosted-30k-v1", interpretation: "Moderate chance" };
  assert.deepEqual(validatePrediction({ ...valid, private_field: "removed" }, shot), valid);
  for (const invalid of [{ ...valid, model_id: "geometry-linear-30k-v1" }, null, {}, { ...valid, model_id: undefined }, { ...valid, model_id: "=formula" }, { ...valid, xg_probability: "0.5" },
    { ...valid, xg_probability: NaN }, { ...valid, xg_probability: Infinity },
    { ...valid, xg_probability: -0.1 }, { ...valid, xg_probability: 1.1 },
    { ...valid, distance_yards: 11 }, { ...valid, distance_yards: Infinity },
    { ...valid, interpretation: " " }, { ...valid, interpretation: "a".repeat(201) }]) {
    assert.throws(() => validatePrediction(invalid, shot), (error: unknown) =>
      error instanceof MLServiceError && error.statusCode === 502);
  }
});

test("distance coverage rejects extrapolated headers without altering in-range predictions", () => {
 assert.equal(distanceSupport(12, defaultContext), null);
 assert.match(distanceSupport(45, {...defaultContext, body_part:"Head"})!, /Outside training range/);
});
