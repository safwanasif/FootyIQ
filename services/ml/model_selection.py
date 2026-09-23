"""Bounded geometry-model comparison. No final-test outcomes are read here."""
import hashlib
import json
import platform
import warnings

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import SplineTransformer, StandardScaler
from threadpoolctl import threadpool_limits

from evaluate import ROOT, FEATURES, metrics, calibration, validate

NAMES = ("linear", "spline", "boosted")
OUTPUT = ROOT / "reports/model-selection"


def candidate(name):
    if name == "linear":
        return LogisticRegression(max_iter=1000, random_state=42)
    if name == "spline":
        return make_pipeline(SplineTransformer(n_knots=5, degree=3, include_bias=False, extrapolation="constant"),
                             StandardScaler(), LogisticRegression(C=1.0, max_iter=1000, random_state=42))
    if name == "boosted":
        return HistGradientBoostingClassifier(max_iter=100, learning_rate=.05, max_leaf_nodes=7,
                                              min_samples_leaf=80, l2_regularization=10,
                                              early_stopping=False, random_state=42)
    raise ValueError(f"Unknown candidate {name}")


def fit(name, df):
    if df.is_goal.nunique() != 2:
        raise ValueError("Both outcomes required in training")
    with warnings.catch_warnings():
        warnings.simplefilter("error", ConvergenceWarning)
        return candidate(name).fit(df[FEATURES].to_numpy(float), df.is_goal.to_numpy(int))


def folds(df, count):
    for train, test in GroupKFold(count).split(df, groups=df.match_id):
        if set(df.iloc[train].match_id) & set(df.iloc[test].match_id):
            raise ValueError("Match leakage")
        yield train, test


def select(df, count=3):
    results = {}
    for name in NAMES:
        predictions = np.full(len(df), np.nan)
        for train, test in folds(df, count):
            model = fit(name, df.iloc[train])
            predictions[test] = model.predict_proba(df.iloc[test][FEATURES].to_numpy(float))[:, 1]
        if not np.isfinite(predictions).all():
            raise ValueError("Missing/nonfinite predictions")
        results[name] = metrics(df.is_goal, predictions)
    selected = min(NAMES, key=lambda name: results[name]["log_loss"])
    return selected, results


def run():
    path = ROOT / "data/expanded_shots.csv"
    df = pd.read_csv(path)
    validate(df)
    if df.event_id.duplicated().any():
        raise ValueError("Duplicate shot IDs")
    nested = np.full(len(df), np.nan)
    linear = np.full(len(df), np.nan)
    outer = []
    for index, (train, test) in enumerate(folds(df, 5), 1):
        chosen, scores = select(df.iloc[train])
        model = fit(chosen, df.iloc[train])
        nested[test] = model.predict_proba(df.iloc[test][FEATURES].to_numpy(float))[:, 1]
        linear[test] = fit("linear", df.iloc[train]).predict_proba(df.iloc[test][FEATURES].to_numpy(float))[:, 1]
        outer.append({"fold": index, "selected": chosen, "inner_scores": scores,
                      "test_match_ids": sorted(map(int, df.iloc[test].match_id.unique())),
                      "metrics": metrics(df.iloc[test].is_goal, nested[test])})
        print(f"Outer fold {index}/5: selected {chosen}", flush=True)
    chosen, scores = select(df, 5)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    artifact = ROOT / "artifacts/selected_candidate.pkl"
    baseline_artifact = ROOT / "artifacts/expanded_linear_reference.pkl"
    joblib.dump(fit(chosen, df), artifact)
    joblib.dump(fit("linear", df), baseline_artifact)
    report = {"method": "5 outer / 3 inner GroupKFold; final selection by 5-fold log loss; fixed candidates",
              "features": FEATURES, "development_shots": len(df), "development_matches": int(df.match_id.nunique()),
              "dataset_sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "selected": chosen,
              "selection_scores": scores, "nested_metrics": metrics(df.is_goal, nested),
              "nested_calibration": calibration(df.is_goal.to_numpy(), nested),
              "linear_metrics": metrics(df.is_goal, linear), "outer_folds": outer,
              "candidate_configuration": {name: str(candidate(name)) for name in NAMES},
              "candidate_sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
              "reference_sha256": hashlib.sha256(baseline_artifact.read_bytes()).hexdigest(),
              "versions": {"python": platform.python_version(), "sklearn": sklearn.__version__, "numpy": np.__version__},
              "serving_model_replaced": False, "final_test_evaluated": False}
    (OUTPUT / "selection.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ["selected", "selection_scores", "nested_metrics", "linear_metrics"]}, indent=2))


if __name__ == "__main__":
    with threadpool_limits(limits=2):
        run()
