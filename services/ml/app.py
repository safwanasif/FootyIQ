"""Versioned context-aware xG inference. Artifact and metadata load once at startup."""
from contextlib import asynccontextmanager
import logging

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from threadpoolctl import threadpool_limits

from model_registry import load_serving_model
from shot_context import ShotContext, default_context, model_input, distance_supported

logger = logging.getLogger("footyiq_api")
YARDS_PER_METER = 1.09361
ml_models = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        model, metadata = load_serving_model()
        ml_models.update(xg_model=model, metadata=metadata)
        logger.info("Loaded model %s", metadata["model_id"])
    except Exception:
        logger.exception("Serving model failed validation/loading")
        ml_models.clear()
    yield
    ml_models.clear()


app = FastAPI(title="FootyIQ xG Inference API", version="0.2.0", lifespan=lifespan)


class ShotInput(BaseModel):
    context: ShotContext = Field(default_factory=default_context)
    distance_meters: float = Field(..., gt=0, allow_inf_nan=False)
    angle_degrees: float = Field(..., ge=0, le=180, allow_inf_nan=False)


class XGResponse(BaseModel):
    xg_probability: float = Field(..., ge=0, le=1, allow_inf_nan=False)
    distance_yards: float = Field(..., ge=0, allow_inf_nan=False)
    interpretation: str
    model_id: str


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_id: str | None = None
    training_shots: int | None = None


def interpret_xg(probability):
    for threshold, label in [(0.5, "High quality chance"), (0.2, "Good chance"),
                             (0.08, "Moderate probability effort"), (0.0, "Low probability effort")]:
        if probability >= threshold:
            return label
    raise ValueError("Invalid probability")


@app.get("/health", response_model=HealthResponse)
async def health_check():
    loaded = ml_models.get("xg_model") is not None
    metadata = ml_models.get("metadata", {})
    return HealthResponse(status="ok" if loaded else "unavailable", model_loaded=loaded,
                          model_id=metadata.get("model_id"), training_shots=metadata.get("training_shots"))


@app.post("/api/v1/predict", response_model=XGResponse)
async def predict_shot(shot: ShotInput):
    model = ml_models.get("xg_model")
    if model is None:
        raise HTTPException(status_code=503, detail="Prediction model is unavailable.")
    distance_yards = shot.distance_meters * YARDS_PER_METER
    if not np.isfinite(distance_yards):
        raise HTTPException(status_code=422, detail="Distance is outside the supported numeric range.")
    if not distance_supported(distance_yards, shot.context):
        raise HTTPException(status_code=422, detail="Outside the observed training distance range for this context.")
    with threadpool_limits(limits=2):
        probability = float(model.predict_proba(model_input(distance_yards, shot.angle_degrees, shot.context))[0, 1])
    return XGResponse(xg_probability=round(probability, 4), distance_yards=round(distance_yards, 4),
                      interpretation=interpret_xg(probability), model_id=ml_models["metadata"]["model_id"])
