"""One final evaluation of a frozen selection on previously unused matches."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import math
import time

import joblib
import numpy as np
import pandas as pd
from threadpoolctl import threadpool_limits

from evaluate import ROOT, FEATURES, metrics, calibration, validate
from expand_data import fetch, clean_shot, order_matches, REVISION
from model_selection import OUTPUT
from scale_experiment import paired_brier_interval


def excluded_matches(dataset, original):
    return {int(m["match_id"]) for m in dataset["matches"]} | {
        int(mid) for fold in original["folds"] for mid in fold["test_match_ids"]}


def geometry(x, y):
    distance = math.hypot(120 - x, 40 - y)
    angle = abs(math.atan2(36 - y, 120 - x) - math.atan2(44 - y, 120 - x))
    return [distance, math.degrees(min(angle, 2 * math.pi - angle))]


def acquire_final(excluded, target=3000):
    catalog = fetch("competitions.json")
    available = {}
    for season in catalog:
        if season["competition_gender"] != "male" or season["competition_youth"] or int(season["season_name"][:4]) < 2015:
            continue
        for match in fetch(f"matches/{season['competition_id']}/{season['season_id']}.json"):
            if match["match_id"] not in excluded:
                available[match["match_id"]] = {"match_id": match["match_id"], "match_date": match["match_date"],
                    **{key: season[key] for key in ["competition_id", "competition_name", "season_id", "season_name"]}}
    ordered = order_matches(available.values())
    rows, sources = [], []
    with ThreadPoolExecutor(max_workers=4) as executor:
        for start in range(0, len(ordered), 20):
            batch = ordered[start:start + 20]
            for match, events in zip(batch, executor.map(lambda m: fetch(f"events/{m['match_id']}.json"), batch)):
                cleaned = [row for event in events if (row := clean_shot(event, match)) is not None]
                rows.extend(cleaned)
                raw_path = ROOT / "data/source-cache" / REVISION / f"events/{match['match_id']}.json"
                sources.append({**match, "shots": len(cleaned), "source_sha256": hashlib.sha256(raw_path.read_bytes()).hexdigest()})
                if len(rows) >= target:
                    break
            print(f"Final test acquisition: {len(rows)} eligible shots", flush=True)
            if len(rows) >= target:
                break
    if len(rows) < target:
        raise ValueError("Insufficient unused matches for the predefined test")
    df = pd.DataFrame(rows)
    validate(df)
    if df.event_id.duplicated().any() or set(df.match_id) & excluded:
        raise ValueError("Duplicate or previously used final-test data")
    df.to_csv(ROOT / "data/final_test_shots.csv", index=False, lineterminator="\n")
    return df, sources


def qualifies(candidate_metrics, reference_metrics, interval):
    return candidate_metrics["log_loss"] < reference_metrics["log_loss"] and interval["upper_95"] < 0


def run():
    selection_path = OUTPUT / "selection.json"
    selection = json.loads(selection_path.read_text())
    dataset = json.loads((ROOT / "reports/expanded/dataset.json").read_text())
    if selection["dataset_sha256"] != dataset["dataset_sha256"]:
        raise ValueError("Selection/development dataset mismatch")
    models = {}
    paths = {"candidate": "selected_candidate.pkl", "expanded_linear": "expanded_linear_reference.pkl", "serving": "baseline_xg.pkl"}
    hashes = {}
    for name, filename in paths.items():
        path = ROOT / "artifacts" / filename
        hashes[name] = hashlib.sha256(path.read_bytes()).hexdigest()
        if name != "serving" and hashes[name] != selection["candidate_sha256" if name == "candidate" else "reference_sha256"]:
            raise ValueError("Frozen artifact hash mismatch")
        models[name] = joblib.load(path)
    original = json.loads((ROOT / "reports/evaluation.json").read_text())
    test, sources = acquire_final(excluded_matches(dataset, original))
    x = test[FEATURES].to_numpy(float)
    predictions = {name: model.predict_proba(x)[:, 1] for name, model in models.items()}
    results = {name: {"metrics": metrics(test.is_goal, probabilities),
                      "calibration": calibration(test.is_goal.to_numpy(), probabilities),
                      "by_competition": {competition: {"shots": len(group), **metrics(group.is_goal, probabilities[test.index.isin(group.index)])}
                                         for competition, group in test.groupby("competition_name")}}
               for name, probabilities in predictions.items()}
    intervals = {name: paired_brier_interval(test, predictions["candidate"], predictions[name]) for name in ["expanded_linear", "serving"]}
    grid = np.array([geometry(x, y) for x in np.linspace(60, 119.9, 61) for y in np.linspace(0, 80, 81)])
    grid_predictions = models["candidate"].predict_proba(grid)[:, 1]
    presets = models["candidate"].predict_proba(np.array([geometry(108, 40), geometry(110, 18), geometry(90, 40)]))[:, 1]
    started = time.perf_counter()
    for _ in range(100):
        models["candidate"].predict_proba(x[:1])
    latency_ms = (time.perf_counter() - started) * 10
    sanity = {"grid_points": len(grid), "finite_bounded": bool(np.isfinite(grid_predictions).all() and ((grid_predictions >= 0) & (grid_predictions <= 1)).all()),
              "central_above_tight_and_long": bool(presets[0] > max(presets[1:])),
              "preset_probabilities": list(map(float, presets)), "mean_single_inference_ms_two_threads": latency_ms}
    statistical = all(qualifies(results["candidate"]["metrics"], results[name]["metrics"], intervals[name]) for name in intervals)
    eligible = selection["selected"] != "linear" and statistical and sanity["finite_bounded"] and sanity["central_above_tight_and_long"] and latency_ms < 100
    report = {"selected": selection["selected"], "test_shots": len(test), "test_matches": int(test.match_id.nunique()),
              "source_revision": REVISION, "source_matches": sources,
              "selection_sha256": hashlib.sha256(selection_path.read_bytes()).hexdigest(),
              "test_dataset_sha256": hashlib.sha256((ROOT / "data/final_test_shots.csv").read_bytes()).hexdigest(),
              "artifact_hashes": hashes, "results": results, "paired_brier_candidate_minus_reference": intervals,
              "sanity": sanity, "promotion_eligible": bool(eligible), "serving_model_replaced": False,
              "decision": "Candidate qualifies for integration review" if eligible else "Keep serving baseline; close v1 model experimentation",
              "limitations": "Unused matches from selective open-data coverage; not a future-season test. No retuning after this result."}
    (OUTPUT / "final-test.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    lines = ["# Final v1 model decision", "", report["decision"], "",
             f"Selected before opening final-test outcomes: **{selection['selected']}**. {len(test):,} shots across {test.match_id.nunique()} unused matches.", "",
             "| Model | Log loss | Brier score | ROC-AUC |", "| --- | ---: | ---: | ---: |"]
    for name, result in results.items():
        m = result["metrics"]
        lines.append(f"| {name} | {m['log_loss']:.6f} | {m['brier_score']:.6f} | {m['roc_auc']:.6f} |")
    lines += ["", "## Predefined promotion rule", "", "Lower log loss and a paired match-bootstrap 95% Brier-difference interval entirely below zero against BOTH the expanded linear reference and the unchanged serving artifact. Also require finite bounded pitch outputs, central chance above tight/long presets, and mean single inference below 100 ms with two threads. These criteria were fixed before the final test.", ""]
    for name, interval in intervals.items():
        lines.append(f"- Candidate minus {name}: Brier difference {interval['difference']:.6f}; 95% interval [{interval['lower_95']:.6f}, {interval['upper_95']:.6f}].")
    lines += ["", "## Development evaluation", "", "Five outer match folds evaluate the selection procedure; three inner match folds select among fixed candidates. The final candidate is selected using five-fold log loss across all development data. Transformations are fitted within training folds; tree early stopping is disabled to avoid an internal shot-level split.", "",
              f"Nested selection log loss: {selection['nested_metrics']['log_loss']:.6f}; Brier: {selection['nested_metrics']['brier_score']:.6f}. Expanded linear reference log loss: {selection['linear_metrics']['log_loss']:.6f}; Brier: {selection['linear_metrics']['brier_score']:.6f}.", "",
              "## Scope and stopping point", "", report["limitations"], "", "The final test excludes every match in both previous datasets. Competitions with no unused matches cannot appear in this test. Neither the original World Cup CV score nor expanded-data CV scores are directly comparable with these final-test scores. Candidate artifacts remain separate; the serving model is unchanged. Detailed calibration, competition results, source hashes, artifact hashes and numerical checks are in final-test.json.", "",
              "Reproduce selection first, then the final test (reproduction is not a new independent experiment):", "", "```powershell",
              r".\services\ml\venv\Scripts\python.exe services/ml/model_selection.py",
              r".\services\ml\venv\Scripts\python.exe services/ml/final_model_test.py", "```", ""]
    (OUTPUT / "decision.md").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines), flush=True)


if __name__ == "__main__":
    with threadpool_limits(limits=2):
        run()
