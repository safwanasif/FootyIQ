import asyncio
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
from app import lifespan, app, predict_shot, health_check, ShotInput
from shot_context import model_input, default_context, ShotContext
from pydantic import ValidationError
from model_registry import load_serving_model, ROOT


class ServingModelTests(unittest.TestCase):
    def test_release_matches_evaluated_linear_artifact_and_training_data(self):
        model, manifest = load_serving_model()
        final = json.loads((ROOT / "reports/context/selection.json").read_text())
        dataset = json.loads((ROOT / "reports/expanded/dataset.json").read_text())
        self.assertEqual(manifest["artifact_sha256"], final["artifact_sha256"])
        self.assertEqual(manifest["dataset_sha256"], dataset["dataset_sha256"])
        self.assertEqual(manifest["training_shots"], 30011)
        self.assertEqual(manifest["training_matches"], len(dataset["matches"]))
        probabilities = model.predict_proba(model_input(12, 36.86989765, default_context()))[:, 1]
        self.assertTrue(np.isfinite(probabilities).all())
        self.assertTrue(((probabilities >= 0) & (probabilities <= 1)).all())
        with self.assertRaises(ValidationError):
            ShotContext(body_part="Head", technique="Backheel", shot_type="Corner", play_pattern="Other")
        self.assertEqual(hashlib.sha256((ROOT / "artifacts/geometry_linear_30k_v1.pkl").read_bytes()).hexdigest(), manifest["previous_artifact_sha256"])

    def test_mismatched_artifact_is_rejected_before_loading(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / "artifacts").mkdir()
            (path / "artifacts/model.pkl").write_bytes(b"invalid pickle")
            (path / "serving-model.json").write_text(json.dumps({"model_id": "test-model", "artifact": "model.pkl", "artifact_sha256": "0" * 64}))
            with self.assertRaisesRegex(ValueError, "fingerprint"):
                load_serving_model(path / "serving-model.json")

    def test_prediction_and_health_expose_the_loaded_model_identity(self):
        async def scenario():
            async with lifespan(app):
                health = await health_check()
                prediction = await predict_shot(ShotInput(distance_meters=11, angle_degrees=37))
                self.assertTrue(health.model_loaded)
                self.assertEqual(health.training_shots, 30011)
                self.assertEqual(prediction.model_id, "context-boosted-30k-v1")
                self.assertEqual(prediction.model_id, health.model_id)
        asyncio.run(scenario())


if __name__ == "__main__":
    unittest.main()
