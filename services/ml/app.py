"""
============================================================================
FootyIQ ML Service — FastAPI xG Inference Microservice (app.py)
============================================================================
PURPOSE:
    Exposes the baseline xG model as an async REST API. Loads the serialized
    Logistic Regression artifact (services/ml/artifacts/baseline_xg.pkl)
    exactly ONCE at server startup via FastAPI's lifespan context manager,
    then serves predictions from memory on every request — no disk I/O
    per-request.

    This file is intentionally separate from predict.py (the CLI tool).
    Both consume the same .pkl artifact, but app.py is the always-on
    service; predict.py remains a standalone one-off inference script.

ENDPOINTS:
    GET  /health              -> service + model load status
    POST /api/v1/predict      -> shot geometry in, xG probability out

USAGE:
    (venv) PS ...\\services\\ml> uvicorn app:app --reload --port 5000

DEPENDENCIES:
    fastapi, uvicorn, pydantic, joblib, numpy
============================================================================
"""

import sys
import logging
from pathlib import Path
from contextlib import asynccontextmanager

import numpy as np
import joblib
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# ============================================================================
# LOGGING CONFIGURATION
# ============================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("footyiq_api")

# ============================================================================
# CONFIG / CONSTANTS
# ============================================================================
SCRIPT_DIR = Path(__file__).resolve().parent
MODEL_ARTIFACT_PATH = SCRIPT_DIR / "artifacts" / "baseline_xg.pkl"

# StatsBomb pitch coordinates (and our trained distance_to_goal feature)
# are in YARDS. The API accepts distance_meters as the user-facing unit
# and converts internally before calling the model — same convention as
# predict.py, kept consistent across both consumers of the artifact.
YARDS_PER_METER = 1.09361

# Thresholds for the human-readable "interpretation" field in the response.
# These are illustrative buckets over the predicted xG probability.
INTERPRETATION_THRESHOLDS = [
    (0.50, "High quality chance"),
    (0.20, "Good chance"),
    (0.08, "Moderate probability effort"),
    (0.00, "Low probability effort"),
]

# ============================================================================
# APPLICATION STATE
# ============================================================================
# Holds the loaded model reference. Populated once in the lifespan startup
# block below; never reassigned or reloaded during request handling.
ml_models = {}


# ============================================================================
# LIFESPAN: LOAD MODEL ONCE AT STARTUP
# ============================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context manager.

    STARTUP (before 'yield'):
        Load the serialized model artifact into memory ONCE. This avoids
        the anti-pattern of calling joblib.load() inside a route handler,
        which would re-read the .pkl from disk on every single request.

    SHUTDOWN (after 'yield'):
        Clear the in-memory reference for a clean teardown.
    """
    if not MODEL_ARTIFACT_PATH.exists():
        logger.error(f"Model artifact not found at {MODEL_ARTIFACT_PATH}")
        logger.error("Run train_baseline.py first to generate the artifact.")
        # Do not crash the whole process — health check should still report
        # model_loaded=False so the failure is observable via the API.
        ml_models["xg_model"] = None
    else:
        ml_models["xg_model"] = joblib.load(MODEL_ARTIFACT_PATH)
        logger.info(f"Model artifact loaded into memory: {MODEL_ARTIFACT_PATH}")

    yield  # <-- API serves requests while suspended here

    # --- Shutdown ---
    ml_models.clear()
    logger.info("Model reference cleared. Server shutting down.")


# ============================================================================
# FASTAPI APP INITIALIZATION
# ============================================================================
app = FastAPI(
    title="FootyIQ xG Inference API",
    description="Serves expected goals (xG) predictions from a baseline Logistic Regression model.",
    version="0.1.0",
    lifespan=lifespan,
)


# ============================================================================
# PYDANTIC MODELS: REQUEST / RESPONSE SCHEMAS
# ============================================================================
class ShotInput(BaseModel):
    """
    Request schema for a single shot prediction.

    Validation:
        distance_meters must be strictly positive (a shot at distance 0
        or negative is physically meaningless).
        angle_degrees must fall within [0, 180], the valid range for an
        angle subtended by two goalposts as seen from any point on pitch.
    """
    distance_meters: float = Field(
        ..., gt=0, description="Shot distance to goal, in meters. Must be > 0."
    )
    angle_degrees: float = Field(
        ..., ge=0, le=180,
        description="Shot angle subtended by the goalposts, in degrees. Range: 0-180."
    )


class XGResponse(BaseModel):
    """
    Response schema for a single shot prediction.
    """
    xg_probability: float = Field(
        ..., description="Predicted probability of the shot resulting in a goal (0-1), rounded to 4 decimal places."
    )
    distance_yards: float = Field(
        ..., description="Input distance converted to yards (the model's native training unit)."
    )
    interpretation: str = Field(
        ..., description="Human-readable quality bucket for this shot's xG value."
    )


class HealthResponse(BaseModel):
    """Response schema for the health-check endpoint."""
    status: str
    model_loaded: bool


# ============================================================================
# HELPERS
# ============================================================================
def interpret_xg(probability: float) -> str:
    """
    Map a raw xG probability to a human-readable quality bucket using
    descending threshold lookup.
    """
    for threshold, label in INTERPRETATION_THRESHOLDS:
        if probability >= threshold:
            return label
    return INTERPRETATION_THRESHOLDS[-1][1]  # fallback, unreachable given 0.00 floor


# ============================================================================
# ROUTES
# ============================================================================
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health-check endpoint. Reports service status and whether the model
    artifact was successfully loaded at startup.
    """
    model_loaded = ml_models.get("xg_model") is not None
    return HealthResponse(status="ok", model_loaded=model_loaded)


@app.post("/api/v1/predict", response_model=XGResponse)
async def predict_shot(shot: ShotInput):
    """
    Predict xG probability for a single shot.

    Pipeline:
        1. Validate input via ShotInput (Pydantic — happens automatically
           before this function body runs).
        2. Convert distance_meters -> distance_yards.
        3. Feed [distance_yards, angle_degrees] to the pre-loaded model.
        4. Bucket the probability into a human-readable interpretation.
        5. Return XGResponse.
    """
    model = ml_models.get("xg_model")
    if model is None:
        raise HTTPException(
            status_code=503,
            detail="Model is not loaded. Check server startup logs / run train_baseline.py.",
        )

    distance_yards = shot.distance_meters * YARDS_PER_METER

    # Feature order MUST match training: [distance_to_goal, shot_angle]
    X = np.array([[distance_yards, shot.angle_degrees]])
    probability = float(model.predict_proba(X)[0, 1])

    return XGResponse(
        xg_probability=round(probability, 4),
        distance_yards=round(distance_yards, 4),
        interpretation=interpret_xg(probability),
    )