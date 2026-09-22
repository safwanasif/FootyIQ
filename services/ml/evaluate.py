"""Reproducible, match-held-out evaluation. Never overwrites the serving model."""
import argparse
import hashlib
import json
import platform
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.exceptions import ConvergenceWarning

FEATURES = ["distance_to_goal", "shot_angle"]
ROOT = Path(__file__).resolve().parent


def validate(df):
    required = FEATURES + ["is_goal", "match_id"]
    missing = set(required) - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns: {sorted(missing)}")
    if df.empty or df[required].isna().any().any():
        raise ValueError("Dataset must be nonempty and contain no missing required values")
    values = df[FEATURES + ["is_goal"]].to_numpy(dtype=float)
    if not np.isfinite(values).all():
        raise ValueError("Features and labels must be finite")
    if not df.is_goal.isin([0, 1]).all():
        raise ValueError("is_goal must contain only 0 and 1")
    if not (df.distance_to_goal > 0).all() or not df.shot_angle.between(0, 180).all():
        raise ValueError("Distance must be positive and angle must be in [0, 180]")
    if df.match_id.nunique() < 2:
        raise ValueError("At least two distinct matches are required")
    if ("shot_type" in df and df.shot_type.eq("Penalty").any()) or ("period" in df and df.period.eq(5).any()):
        raise ValueError("This evaluation expects penalties and shootouts to be excluded")


def metrics(y, probabilities):
    return {
        "log_loss": float(log_loss(y, probabilities, labels=[0, 1])),
        "brier_score": float(brier_score_loss(y, probabilities)),
        "roc_auc": float(roc_auc_score(y, probabilities)) if len(np.unique(y)) == 2 else None,
    }


def calibration(y, probabilities):
    # Fixed bins include exactly 1.0 in the final bin. Empty bins stay visible.
    assignments = np.minimum((probabilities * 10).astype(int), 9)
    bins = []
    for index in range(10):
        mask = assignments == index
        count = int(mask.sum())
        bins.append({
            "lower": index / 10, "upper": (index + 1) / 10, "count": count,
            "mean_prediction": float(probabilities[mask].mean()) if count else None,
            "goal_rate": float(y[mask].mean()) if count else None,
        })
    return bins


def evaluate(df, requested_folds=5):
    validate(df)
    if requested_folds < 2:
        raise ValueError("At least two folds are required")
    x = df[FEATURES].to_numpy(dtype=float)
    y = df.is_goal.to_numpy(dtype=int)
    groups = df.match_id.to_numpy()
    count = min(requested_folds, df.match_id.nunique())
    predictions = np.full(len(df), np.nan)
    baseline = np.full(len(df), np.nan)
    folds = []
    for index, (train, test) in enumerate(GroupKFold(count).split(x, y, groups), 1):
        if set(groups[train]) & set(groups[test]):
            raise ValueError("Match leakage detected")
        if len(np.unique(y[train])) != 2:
            raise ValueError(f"Fold {index} training set needs both goals and non-goals")
        model = LogisticRegression(random_state=42, max_iter=1000)
        with warnings.catch_warnings():
            warnings.simplefilter("error", ConvergenceWarning)
            model.fit(x[train], y[train])
        predictions[test] = model.predict_proba(x[test])[:, 1]
        baseline[test] = y[train].mean()  # No held-out labels inform the comparator.
        folds.append({
            "fold": index, "training_shots": len(train), "test_shots": len(test),
            "training_goal_rate": float(y[train].mean()),
            "test_match_ids": sorted(str(value) for value in set(groups[test])),
            "model": metrics(y[test], predictions[test]),
            "goal_rate_baseline": metrics(y[test], baseline[test]),
        })
    if not np.isfinite(predictions).all():
        raise ValueError("Some rows did not receive a held-out prediction")
    return {
        "method": "GroupKFold by match_id; pooled out-of-fold predictions",
        "features": FEATURES, "seed": 42, "fold_count": count,
        "estimator": {"class": "LogisticRegression", "max_iter": 1000, "C": 1.0},
        "shots": len(df), "matches": int(df.match_id.nunique()),
        "goals": int(y.sum()), "goal_rate": float(y.mean()),
        "model": metrics(y, predictions), "goal_rate_baseline": metrics(y, baseline),
        "calibration": calibration(y, predictions), "folds": folds,
        "versions": {"python": platform.python_version(), "sklearn": sklearn.__version__,
                     "numpy": np.__version__, "pandas": pd.__version__},
    }


def markdown(report):
    lines = ["# FootyIQ model evaluation", "",
             f"{report['shots']:,} shots across {report['matches']} matches; {report['goals']} goals "
             f"({report['goal_rate']:.2%}). {report['fold_count']} folds, grouped by match.", "",
             "Each shot is evaluated by a model trained on other matches. The comparator predicts the training fold's goal rate for every test shot. Scores below pool all held-out predictions.", "",
             "| Metric | Geometry model | Goal-rate baseline |",
             "| --- | ---: | ---: |"]
    for key, label in [("log_loss", "Log loss (lower is better)"), ("brier_score", "Brier score (lower is better)"), ("roc_auc", "ROC-AUC (higher is better)")]:
        def fmt(value):
            return "undefined" if value is None else f"{value:.4f}"
        lines.append(f"| {label} | {fmt(report['model'][key])} | {fmt(report['goal_rate_baseline'][key])} |")
    lines += ["", "## Calibration", "",
              "Calibration compares predicted probability with observed scoring rate in fixed probability bins. Sparse bins are noisy; this is a diagnostic, not a fitted calibration correction.", "",
              "| Probability bin | Shots | Mean prediction | Observed goal rate |",
              "| --- | ---: | ---: | ---: |"]
    for item in report["calibration"]:
        predicted = "—" if item["count"] == 0 else f"{item['mean_prediction']:.2%}"
        observed = "—" if item["count"] == 0 else f"{item['goal_rate']:.2%}"
        lines.append(f"| {item['lower']:.0%}–{item['upper']:.0%} | {item['count']} | {predicted} | {observed} |")
    lines += ["", "## Interpretation and limits", "",
              "These scores evaluate the training procedure with distance and angle only. They are not a new, untouched external test of the serialized model. Match grouping prevents within-match leakage, but does not establish performance on future seasons or other competitions. No hyperparameter search or probability recalibration is performed.", "",
              "The pooled baseline ROC-AUC need not equal 0.5: training goal rates vary across folds. Within each fold the constant comparator has AUC 0.5 when both outcomes are present.", "",
              "The current serving artifact is left unchanged. Defender/goalkeeper locations, body part and shot technique are not model inputs. Reported results apply only to this local CSV; the ETL excludes penalties and shootouts.", "",
              "## Reproducibility", "",
              f"Dataset SHA-256: `{report['dataset_sha256']}`", "",
              "Exact test-match membership, fold metrics, calibration bins, and library versions are in `evaluation.json`.", "",
              "```powershell", r".\services\ml\venv\Scripts\python.exe services/ml/evaluate.py", "```", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=ROOT / "data/world_cup_shots.csv")
    parser.add_argument("--output", type=Path, default=ROOT / "reports")
    parser.add_argument("--folds", type=int, default=5)
    args = parser.parse_args()
    report = evaluate(pd.read_csv(args.data), args.folds)
    report["dataset_sha256"] = hashlib.sha256(args.data.read_bytes()).hexdigest()
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "evaluation.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    (args.output / "evaluation.md").write_text(markdown(report), encoding="utf-8")
    print(json.dumps({"model": report["model"], "baseline": report["goal_rate_baseline"]}, indent=2))
    print(f"Reports written to {args.output}")


if __name__ == "__main__":
    main()
