"""Frozen context experiment: selection and fresh-test stages are separate."""
import argparse
import hashlib
import json
import time
import warnings

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from threadpoolctl import threadpool_limits

from evaluate import ROOT, FEATURES, metrics, calibration, validate
from expand_data import REVISION, fetch, clean_shot, order_matches
from model_selection import folds
from scale_experiment import paired_brier_interval

OUT = ROOT / "reports/context"
CATS = ["body_part", "technique", "shot_type", "play_pattern"]
NAMES = ("geometry", "context_linear", "context_boosted")


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def context(event):
    shot = event.get("shot", {})
    return {"body_part": shot.get("body_part", {}).get("name") or "UNKNOWN",
            "technique": shot.get("technique", {}).get("name") or "UNKNOWN",
            "shot_type": shot.get("type", {}).get("name") or "UNKNOWN",
            "play_pattern": event.get("play_pattern", {}).get("name") or "UNKNOWN"}


def development():
    manifest = read(ROOT / "reports/expanded/dataset.json")
    path = ROOT / "data/expanded_shots.csv"
    if digest(path) != manifest["dataset_sha256"]:
        raise ValueError("Development hash mismatch")
    df = pd.read_csv(path)
    wanted = set(df.event_id)
    attached = {}
    for i, match in enumerate(manifest["matches"], 1):
        source = ROOT / "data/source-cache" / REVISION / f"events/{match['match_id']}.json"
        if digest(source) != match["source_sha256"]:
            raise ValueError("Source hash mismatch")
        for event in read(source):
            if event.get("id") in wanted:
                if event["id"] in attached:
                    raise ValueError("Duplicate context event")
                attached[event["id"]] = {**context(event), "match_id": match["match_id"]}
        if i % 200 == 0:
            print(f"Attached context: {i}/{len(manifest['matches'])} matches", flush=True)
    if set(attached) != wanted or len(wanted) != len(df):
        raise ValueError("Event membership mismatch")
    if any(attached[row.event_id]["match_id"] != row.match_id for row in df.itertuples()):
        raise ValueError("Context match mismatch")
    for key in CATS:
        df[key] = df.event_id.map(lambda event_id: attached[event_id][key])
    validate(df)
    df.to_csv(ROOT / "data/context_development.csv", index=False, lineterminator="\n")
    return df


def candidate(name):
    if name == "geometry":
        return make_pipeline(ColumnTransformer([("geometry", "passthrough", FEATURES)]),
                             LogisticRegression(max_iter=1000, random_state=42))
    transform = ColumnTransformer([
        ("geometry", StandardScaler() if name == "context_linear" else "passthrough", FEATURES),
        ("context", OneHotEncoder(min_frequency=100, handle_unknown="infrequent_if_exist", sparse_output=False), CATS)])
    estimator = (LogisticRegression(C=1, max_iter=2000, random_state=42) if name == "context_linear" else
                 HistGradientBoostingClassifier(max_iter=100, learning_rate=.05, max_leaf_nodes=7,
                    min_samples_leaf=80, l2_regularization=10, early_stopping=False, random_state=42))
    if name not in NAMES:
        raise ValueError(name)
    return make_pipeline(transform, estimator)


def fit(name, df):
    with warnings.catch_warnings():
        warnings.simplefilter("error", ConvergenceWarning)
        return candidate(name).fit(df[FEATURES + CATS], df.is_goal)


def predict(model, df):
    p = model.predict_proba(df[FEATURES + CATS])[:, 1]
    if not np.isfinite(p).all() or not ((p >= 0) & (p <= 1)).all():
        raise ValueError("Invalid probabilities")
    return p


def summary(df, p):
    return {"metrics": metrics(df.is_goal, p), "calibration": calibration(df.is_goal.to_numpy(), p),
            "slices": {key: {str(value): {"shots": int(mask.sum()), **metrics(df.loc[mask, "is_goal"], p[mask])}
                       for value in sorted(df[key].unique()) for mask in [df[key].eq(value).to_numpy()]}
                       for key in ["competition_name", "body_part"]}}


def select(df, count):
    scores = {}
    for name in NAMES:
        p = np.full(len(df), np.nan)
        for train, test in folds(df, count):
            p[test] = predict(fit(name, df.iloc[train]), df.iloc[test])
        scores[name] = metrics(df.is_goal, p)
    return min(NAMES, key=lambda name: scores[name]["log_loss"]), scores


def selection():
    if (OUT / "selection.json").exists():
        raise ValueError("Selection already frozen; refusing to overwrite")
    df = development()
    nested, reference = np.full(len(df), np.nan), np.full(len(df), np.nan)
    records = []
    for i, (train, test) in enumerate(folds(df, 5), 1):
        chosen, scores = select(df.iloc[train], 3)
        nested[test] = predict(fit(chosen, df.iloc[train]), df.iloc[test])
        reference[test] = predict(fit("geometry", df.iloc[train]), df.iloc[test])
        records.append({"fold": i, "selected": chosen, "scores": scores,
                        "test_match_ids": sorted(map(int, df.iloc[test].match_id.unique()))})
        print(f"Outer fold {i}/5 selected {chosen}", flush=True)
    chosen, scores = select(df, 5)
    artifact = ROOT / "artifacts/context_selected.pkl"
    joblib.dump(fit(chosen, df), artifact)
    write("selection.json", {"selected": chosen, "selection_scores": scores, "outer_folds": records,
        "nested": summary(df, nested), "geometry": summary(df, reference),
        "development_shots": len(df), "development_matches": int(df.match_id.nunique()),
        "development_sha256": digest(ROOT / "data/context_development.csv"),
        "protocol_sha256": digest(OUT / "protocol.md"), "artifact_sha256": digest(artifact),
        "serving_sha256": digest(ROOT / "artifacts/geometry_linear_30k_v1.pkl"),
        "configurations": {name: str(candidate(name)) for name in NAMES}})
    print(json.dumps({"selected": chosen, "scores": scores}, indent=2), flush=True)


def final_test():
    if (OUT / "final-test.json").exists():
        raise ValueError("Final test already recorded; refusing to overwrite")
    frozen = read(OUT / "selection.json")
    artifact = ROOT / "artifacts/context_selected.pkl"
    serving = ROOT / "artifacts/geometry_linear_30k_v1.pkl"
    if digest(artifact) != frozen["artifact_sha256"] or digest(serving) != frozen["serving_sha256"] or digest(OUT / "protocol.md") != frozen["protocol_sha256"]:
        raise ValueError("Frozen experiment mismatch")
    excluded = {m["match_id"] for m in read(ROOT / "reports/expanded/dataset.json")["matches"]}
    excluded.update(m["match_id"] for m in read(ROOT / "reports/model-selection/final-test.json")["source_matches"])
    excluded.update(int(mid) for f in read(ROOT / "reports/evaluation.json")["folds"] for mid in f["test_match_ids"])
    available = []
    for season in fetch("competitions.json"):
        if season["competition_gender"] != "male" or season["competition_youth"] or int(season["season_name"][:4]) < 2015:
            continue
        for match in fetch(f"matches/{season['competition_id']}/{season['season_id']}.json"):
            if match["match_id"] not in excluded:
                available.append({"match_id": match["match_id"], "match_date": match["match_date"],
                    **{k: season[k] for k in ["competition_id", "competition_name", "season_id", "season_name"]}})
    rows, sources = [], []
    for match in order_matches(available):
        events = fetch(f"events/{match['match_id']}.json")
        cleaned = [{**row, **context(event)} for event in events if (row := clean_shot(event, match)) is not None]
        rows.extend(cleaned)
        sources.append({**match, "shots": len(cleaned), "source_sha256": digest(ROOT / "data/source-cache" / REVISION / f"events/{match['match_id']}.json")})
        if len(sources) % 10 == 0:
            print(f"Fresh test: {len(rows)} shots in {len(sources)} matches", flush=True)
        if len(rows) >= 3000:
            break
    if len(rows) < 3000:
        write("final-test.json", {"promotion_eligible": False, "reason": "Insufficient fresh shots", "source_matches": sources})
        return
    df = pd.DataFrame(rows)
    validate(df)
    if df.event_id.duplicated().any() or set(df.match_id) & excluded:
        raise ValueError("Fresh-test overlap")
    path = ROOT / "data/context_final_test.csv"
    df.to_csv(path, index=False, lineterminator="\n")
    model = joblib.load(artifact)
    p = predict(model, df)
    base = joblib.load(serving).predict_proba(df[FEATURES].to_numpy(float))[:, 1]
    interval = paired_brier_interval(df, p, base)
    # Exercise every observed development context on representative pitch geometry.
    dev = pd.read_csv(ROOT / "data/context_development.csv")
    if digest(ROOT / "data/context_development.csv") != frozen["development_sha256"]:
        raise ValueError("Development context changed")
    probes = dev.drop_duplicates(CATS)[FEATURES + CATS].copy()
    for distance, angle in [(1, 170), (12, 36), (30, 15), (60, 1)]:
        probes["distance_to_goal"], probes["shot_angle"] = distance, angle
        predict(model, probes)
    start = time.perf_counter()
    for _ in range(100):
        predict(model, df.iloc[:1])
    latency = (time.perf_counter() - start) * 10
    result, baseline = summary(df, p), summary(df, base)
    eligible = frozen["selected"] != "geometry" and result["metrics"]["log_loss"] < baseline["metrics"]["log_loss"] and interval["upper_95"] < 0 and latency < 100
    report = {"selected": frozen["selected"], "test_shots": len(df), "test_matches": int(df.match_id.nunique()),
        "source_revision": REVISION, "source_matches": sources, "test_sha256": digest(path),
        "selection_sha256": digest(OUT / "selection.json"), "candidate": result, "serving": baseline,
        "paired_brier": interval, "mean_inference_ms_two_threads": latency,
        "tested_context_combinations": len(probes), "promotion_eligible": bool(eligible), "serving_model_replaced": False}
    write("final-test.json", report)
    print(json.dumps({k: report[k] for k in ["selected", "test_shots", "test_matches", "paired_brier", "mean_inference_ms_two_threads", "promotion_eligible"]}, indent=2), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=["select", "test"])
    with threadpool_limits(limits=2):
        {"select": selection, "test": final_test}[parser.parse_args().stage]()
