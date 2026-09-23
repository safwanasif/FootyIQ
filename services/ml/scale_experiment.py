"""Compare training sizes on identical held-out matches; preserve serving model."""
import hashlib
import json
import warnings

import joblib
import numpy as np
import pandas as pd
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression

from evaluate import ROOT, FEATURES, calibration, evaluate, markdown, metrics, validate


def split_matches(df):
    test_ids = []
    for _, group in df.groupby("competition_id", sort=True):
        ids = sorted(group.match_id.unique(), key=lambda mid: hashlib.sha256(f"test:42:{mid}".encode()).hexdigest())
        if len(ids) < 2:
            raise ValueError("Each competition needs at least two matches")
        test_ids.extend(ids[:max(1, len(ids) // 5)])
    test = df[df.match_id.isin(test_ids)].copy()
    train = df[~df.match_id.isin(test_ids)].copy()
    assert not set(train.match_id) & set(test.match_id)
    return train, test


def training_subset(train, target):
    ids = sorted(train.match_id.unique(), key=lambda mid: hashlib.sha256(f"train:42:{mid}".encode()).hexdigest())
    counts = train.groupby("match_id").size()
    selected, total = [], 0
    for mid in ids:
        selected.append(mid)
        total += int(counts[mid])
        if total >= target:
            break
    return train[train.match_id.isin(selected)]


def fit(train):
    if train.is_goal.nunique() != 2:
        raise ValueError("Training needs goals and non-goals")
    model = LogisticRegression(random_state=42, max_iter=1000)
    with warnings.catch_warnings():
        warnings.simplefilter("error", ConvergenceWarning)
        return model.fit(train[FEATURES].to_numpy(float), train.is_goal.to_numpy(int))


def paired_brier_interval(test, larger, smaller):
    """Cluster bootstrap: whole matches, paired predictions; negative favors larger."""
    differences = (larger - test.is_goal.to_numpy()) ** 2 - (smaller - test.is_goal.to_numpy()) ** 2
    grouped = pd.DataFrame({"match_id": test.match_id.to_numpy(), "delta": differences}).groupby("match_id").delta.agg(["sum", "count"])
    rng = np.random.default_rng(42)
    draws = rng.integers(0, len(grouped), size=(1000, len(grouped)))
    scores = grouped["sum"].to_numpy()[draws].sum(axis=1) / grouped["count"].to_numpy()[draws].sum(axis=1)
    return {"difference": float(differences.mean()), "lower_95": float(np.quantile(scores, .025)),
            "upper_95": float(np.quantile(scores, .975)), "resamples": 1000}


def run():
    path = ROOT / "data/expanded_shots.csv"
    df = pd.read_csv(path)
    validate(df)
    if df.event_id.duplicated().any():
        raise ValueError("Duplicate events")
    train, test = split_matches(df)
    experiments = [("mixed_3770", training_subset(train, 3770)),
                   ("mixed_10000", training_subset(train, 10000)), ("mixed_all", train),
                   ("world_cup_only", train[train.competition_id.eq(43)])]
    results, predictions = {}, {}
    for name, subset in experiments:
        model = fit(subset)
        predicted = model.predict_proba(test[FEATURES].to_numpy(float))[:, 1]
        predictions[name] = predicted
        results[name] = {"training_shots": len(subset), "training_matches": int(subset.match_id.nunique()),
                         "training_match_ids": sorted(map(int, subset.match_id.unique())),
                         "metrics": metrics(test.is_goal, predicted),
                         "calibration": calibration(test.is_goal.to_numpy(), predicted), "by_competition": {}}
        for competition, group in test.groupby("competition_name", sort=True):
            mask = test.index.isin(group.index)
            results[name]["by_competition"][competition] = {"shots": len(group), **metrics(group.is_goal, predicted[mask])}
    report = {"dataset_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
              "method": "Fixed 20% match holdout per competition, hash seed 42; nested whole-match training subsets; no hyperparameter search",
              "test_shots": len(test), "test_matches": int(test.match_id.nunique()),
              "test_match_ids": sorted(map(int, test.match_id.unique())), "experiments": results,
              "goal_rate_baseline": metrics(test.is_goal, np.full(len(test), train.is_goal.mean())),
              "paired_brier_large_minus_small": paired_brier_interval(test, predictions["mixed_all"], predictions["mixed_3770"]),
              "serving_model_replaced": False}
    output = ROOT / "reports/expanded"
    output.mkdir(parents=True, exist_ok=True)
    cv = evaluate(df)
    cv["dataset_sha256"] = report["dataset_sha256"]
    (output / "evaluation.json").write_text(json.dumps(cv, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    cv_text = markdown(cv).replace("services/ml/evaluate.py", "services/ml/evaluate.py --data services/ml/data/expanded_shots.csv --output services/ml/reports/expanded")
    (output / "evaluation.md").write_text(cv_text, encoding="utf-8")
    report["versions"] = cv["versions"]
    # Candidate is deliberately separate. Full-data fitting happens after evaluation.
    candidate = ROOT / "artifacts/expanded_candidate.pkl"
    joblib.dump(fit(df), candidate)
    report["candidate_sha256"] = hashlib.sha256(candidate.read_bytes()).hexdigest()
    (output / "comparison.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    lines = ["# Does more training data help?", "", report["method"], "",
             f"Dataset: {len(df):,} unique shots. Shared test set: {len(test):,} shots in {test.match_id.nunique()} matches.", "",
             "| Training sample | Shots | Log loss | Brier score | ROC-AUC |", "| --- | ---: | ---: | ---: | ---: |"]
    for name, item in results.items():
        m = item["metrics"]
        lines.append(f"| {name} | {item['training_shots']} | {m['log_loss']:.5f} | {m['brier_score']:.5f} | {m['roc_auc']:.5f} |")
    interval = report["paired_brier_large_minus_small"]
    lines += ["", f"Larger minus smaller mixed-sample Brier difference: {interval['difference']:.6f}; paired match-bootstrap 95% interval [{interval['lower_95']:.6f}, {interval['upper_95']:.6f}]. Negative favors the larger sample. An interval crossing zero does not establish improvement.", "",
              "## Limits", "", "The old 0.758 World Cup cross-validation AUC uses different test data and cannot be compared directly with this table. The World Cup-only row is newly fitted using training matches only, not the old serving artifact. The 3,770-shot row samples mixed competitions; it isolates sample-size effects from a change in competition mix.", "",
              "Open-data coverage is selective (some competitions contain only particular teams or finals). Competition balancing during acquisition does not make this a representative global football sample. This is a retrospective match holdout, not a prospective or unseen-competition test. The shared test set must not become a tuning set. A geometry-only model omits body part, pressure, defenders and goalkeeper position.", "",
              "The candidate artifact was fitted on all expanded data after evaluation and is separate from baseline_xg.pkl. Serving model and original report remain unchanged. Exact membership, per-competition metrics, calibration and source provenance are in the adjacent JSON files.", ""]
    (output / "comparison.md").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    run()
