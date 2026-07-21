"""
============================================================================
FootyIQ ML Service — Standalone xG Inference Engine (predict.py)
============================================================================
PURPOSE:
    Standalone inference script, fully decoupled from training. Loads the
    serialized baseline Logistic Regression model from
    services/ml/artifacts/baseline_xg.pkl and returns an xG probability for
    a given shot geometry.

    This script NEVER loads world_cup_shots.csv and NEVER trains a model —
    it only consumes the artifact produced by train_baseline.py.

USAGE:
    # Predict a specific shot:
    (venv) PS ...\\services\\ml> python predict.py --distance 11.0 --angle 37

    # Run the built-in sanity check demo (no arguments):
    (venv) PS ...\\services\\ml> python predict.py

DEPENDENCIES:
    joblib, scikit-learn (for the unpickled LogisticRegression object), numpy
============================================================================
"""

import sys
import argparse
import logging
from pathlib import Path

import numpy as np
import joblib

# ============================================================================
# LOGGING CONFIGURATION
# ============================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("footyiq_predict")

# ============================================================================
# CONFIG / CONSTANTS
# ============================================================================
SCRIPT_DIR = Path(__file__).resolve().parent
MODEL_ARTIFACT_PATH = SCRIPT_DIR / "artifacts" / "baseline_xg.pkl"

# StatsBomb pitch coordinates (and therefore our trained distance_to_goal
# feature) are in YARDS, since StatsBomb defines the pitch as 120 x 80
# units == yards. This script accepts --distance in METERS per the CLI
# spec, so we convert meters -> yards before feeding the model, keeping
# the model's training units and the CLI's user-facing units decoupled.
YARDS_PER_METER = 1.09361

# Preset scenarios for the no-argument "Sanity Check Demo"
DEMO_SCENARIOS = [
    {"label": "6-Yard Box Tap-in", "distance_m": 5.5, "angle_deg": 65.0},
    {"label": "Penalty Spot", "distance_m": 11.0, "angle_deg": 37.0},
    {"label": "30-Yard Screamer", "distance_m": 27.4, "angle_deg": 15.0},
]


# ============================================================================
# MODEL LOADING
# ============================================================================
def load_model():
    """
    Load the serialized LogisticRegression model artifact.
    Exits with a clear error if the artifact doesn't exist — this is the
    expected failure mode if train_baseline.py hasn't been run yet.
    """
    if not MODEL_ARTIFACT_PATH.exists():
        logger.error(f"Model artifact not found at {MODEL_ARTIFACT_PATH}")
        logger.error("Run train_baseline.py first to generate the artifact.")
        sys.exit(1)

    model = joblib.load(MODEL_ARTIFACT_PATH)
    logger.info(f"Loaded model artifact: {MODEL_ARTIFACT_PATH}")
    return model


# ============================================================================
# INFERENCE
# ============================================================================
def predict_xg(model, distance_meters: float, angle_deg: float) -> float:
    """
    Predict xG probability for a single shot.

    Args:
        model: Loaded LogisticRegression model (trained on yards + degrees).
        distance_meters: Shot distance to goal, in meters (CLI/user unit).
        angle_deg: Shot angle subtended by the goalposts, in degrees.

    Returns:
        Predicted probability of the shot resulting in a goal (0.0-1.0).
    """
    distance_yards = distance_meters * YARDS_PER_METER

    # Feature order MUST match training: [distance_to_goal, shot_angle]
    X = np.array([[distance_yards, angle_deg]])
    probability = model.predict_proba(X)[0, 1]
    return probability


# ============================================================================
# OUTPUT FORMATTING
# ============================================================================
def print_prediction(label: str, distance_m: float, angle_deg: float, xg: float) -> None:
    """Pretty-print a single shot prediction with input geometry."""
    print(
        f"  {label:22} | distance={distance_m:6.2f}m  angle={angle_deg:6.2f}deg  "
        f"-> xG = {xg * 100:6.2f}%"
    )


# ============================================================================
# PIPELINE ORCHESTRATION
# ============================================================================
def run_sanity_check_demo(model) -> None:
    """Run the 3 preset scenarios and print their predicted xG values."""
    print("\n" + "=" * 72)
    print("FootyIQ xG Inference — Sanity Check Demo")
    print("=" * 72)

    for scenario in DEMO_SCENARIOS:
        xg = predict_xg(model, scenario["distance_m"], scenario["angle_deg"])
        print_prediction(
            scenario["label"], scenario["distance_m"], scenario["angle_deg"], xg
        )

    print("=" * 72 + "\n")


def run_single_prediction(model, distance: float, angle: float) -> None:
    """Run inference for a single user-supplied shot and print the result."""
    xg = predict_xg(model, distance, angle)
    print("\n" + "=" * 72)
    print("FootyIQ xG Inference — Single Shot Prediction")
    print("=" * 72)
    print_prediction("Custom Shot", distance, angle, xg)
    print("=" * 72 + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="FootyIQ standalone xG inference engine."
    )
    parser.add_argument(
        "--distance", type=float, default=None,
        help="Shot distance to goal, in meters."
    )
    parser.add_argument(
        "--angle", type=float, default=None,
        help="Shot angle subtended by the goalposts, in degrees."
    )
    args = parser.parse_args()

    model = load_model()

    # If BOTH arguments are provided, run a single prediction.
    # Otherwise (no arguments, or only one), fall back to the demo —
    # this matches the spec's "if no arguments are passed" behavior while
    # avoiding a confusing partial-input state.
    if args.distance is not None and args.angle is not None:
        run_single_prediction(model, args.distance, args.angle)
    else:
        if args.distance is not None or args.angle is not None:
            logger.warning(
                "Both --distance and --angle are required for a custom "
                "prediction. Falling back to the sanity check demo."
            )
        run_sanity_check_demo(model)


if __name__ == "__main__":
    main()