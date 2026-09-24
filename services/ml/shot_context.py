"""Serving support policy: contexts observed at least 100 times in development."""
import json
from pathlib import Path
import pandas as pd
from pydantic import BaseModel, ConfigDict, model_validator

CONTRACT = json.loads(Path(__file__).with_name("shot-context.json").read_text())
KEYS = ["body_part", "technique", "shot_type", "play_pattern"]


class ShotContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body_part: str
    technique: str
    shot_type: str
    play_pattern: str

    @model_validator(mode="after")
    def supported(self):
        if not any(all(getattr(self, key) == row[key] for key in KEYS) for row in CONTRACT["combinations"]):
            raise ValueError("Unsupported shot context combination")
        return self


def default_context():
    return ShotContext(**CONTRACT["defaults"])


def model_input(distance, angle, context):
    return pd.DataFrame([{ "distance_to_goal": distance, "shot_angle": angle, **context.model_dump()}])
