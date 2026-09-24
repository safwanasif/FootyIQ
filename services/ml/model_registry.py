"""Load the versioned serving artifact and verify its recorded identity."""
import hashlib
import json
import re
from pathlib import Path

import joblib

ROOT = Path(__file__).resolve().parent


def load_serving_model(manifest_path=ROOT / "serving-model.json"):
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not re.fullmatch(r"[a-z][a-z0-9._-]{0,79}", manifest["model_id"]):
        raise ValueError("Invalid model ID")
    name = manifest["artifact"]
    if Path(name).name != name or not name.endswith(".pkl"):
        raise ValueError("Artifact must be a filename within artifacts")
    artifact = manifest_path.parent / "artifacts" / name
    if hashlib.sha256(artifact.read_bytes()).hexdigest() != manifest["artifact_sha256"]:
        raise ValueError("Serving artifact fingerprint does not match its manifest")
    model = joblib.load(artifact)
    if model.n_features_in_ != len(manifest["features"]) or list(model.feature_names_in_) != manifest["features"] or list(model.classes_) != [0, 1]:
        raise ValueError("Unexpected model feature/class contract")
    return model, manifest
