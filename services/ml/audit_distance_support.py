"""Derive serving distance coverage from development only; never retune predictions."""
import hashlib
import json
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent
KEYS = ["body_part", "technique", "shot_type", "play_pattern"]


def run():
    path = ROOT / "data/context_development.csv"
    selection = json.loads((ROOT / "reports/context/selection.json").read_text())
    if hashlib.sha256(path.read_bytes()).hexdigest() != selection["development_sha256"]:
        raise ValueError("Development data fingerprint mismatch")
    data = pd.read_csv(path)
    rows = []
    for values, group in data.groupby(KEYS, sort=True):
        if len(group) < 100:
            continue
        rows.append({**dict(zip(KEYS, values)), "shots": len(group),
                     "min_yards": float(group.distance_to_goal.min()),
                     "max_yards": float(group.distance_to_goal.max())})
    report = {"development_sha256": selection["development_sha256"], "combinations": rows,
              "policy": "Withhold estimates outside the observed distance range for this exact context. Coverage is not a confidence interval or guarantee of local accuracy."}
    for destination in [ROOT / "distance-support.json", ROOT.parent / "api/src/distance-support.json", ROOT.parents[1] / "apps/web/lib/distance-support.json"]:
        destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote distance coverage for {len(rows)} supported combinations")


if __name__ == "__main__":
    run()
