"""Audit cached development context without reading unused-match event outcomes."""
import csv
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def run():
    manifest = read(ROOT / "reports/expanded/dataset.json")
    cache = ROOT / "data/source-cache" / manifest["revision"]
    data = ROOT / "data/expanded_shots.csv"
    if hashlib.sha256(data.read_bytes()).hexdigest() != manifest["dataset_sha256"]:
        raise ValueError("Development dataset hash mismatch")
    with data.open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    ids = {row["event_id"] for row in rows}
    if len(ids) != len(rows):
        raise ValueError("Duplicate development event IDs")
    counts = defaultdict(lambda: defaultdict(Counter))
    combinations = Counter()
    seen = set()
    for match in manifest["matches"]:
        path = cache / f"events/{match['match_id']}.json"
        if hashlib.sha256(path.read_bytes()).hexdigest() != match["source_sha256"]:
            raise ValueError("Cached source hash mismatch")
        for event in read(path):
            if event.get("id") not in ids:
                continue
            if event["id"] in seen:
                raise ValueError("Repeated source event")
            seen.add(event["id"])
            shot = event.get("shot", {})
            features = {
                "body_part": shot.get("body_part", {}).get("name", "MISSING"),
                "technique": shot.get("technique", {}).get("name", "MISSING"),
                "shot_type": shot.get("type", {}).get("name", "MISSING"),
                "play_pattern": event.get("play_pattern", {}).get("name", "MISSING"),
                "under_pressure_recorded": str(event.get("under_pressure", "ABSENT")),
                "first_time_recorded": str(shot.get("first_time", "ABSENT")),
            }
            for group in ["ALL", match["competition_name"]]:
                for key, value in features.items():
                    counts[group][key][value] += 1
            combinations[tuple(features[key] for key in ["body_part", "technique", "shot_type", "play_pattern"])] += 1
    if seen != ids:
        raise ValueError("Development/source event mismatch")
    previous = read(ROOT / "reports/model-selection/final-test.json")
    original = read(ROOT / "reports/evaluation.json")
    excluded = {m["match_id"] for m in manifest["matches"]}
    excluded.update(m["match_id"] for m in previous["source_matches"])
    excluded.update(int(mid) for fold in original["folds"] for mid in fold["test_match_ids"])
    available = {}
    for season in read(cache / "competitions.json"):
        if season["competition_gender"] != "male" or season["competition_youth"] or int(season["season_name"][:4]) < 2015:
            continue
        for match in read(cache / f"matches/{season['competition_id']}/{season['season_id']}.json"):
            if match["match_id"] not in excluded:
                available[match["match_id"]] = {"match_id": match["match_id"], "competition": season["competition_name"], "season": season["season_name"]}
    report = {
        "source_revision": manifest["revision"], "dataset_sha256": manifest["dataset_sha256"],
        "development_shots": len(seen), "development_matches": len(manifest["matches"]),
        "counts": {group: {key: dict(sorted(counter.items())) for key, counter in features.items()} for group, features in sorted(counts.items())},
        "context_combinations": [{"values": list(key), "shots": count} for key, count in combinations.most_common()],
        "unused_matches": sorted(available.values(), key=lambda m: m["match_id"]),
        "unused_by_competition": dict(sorted(Counter(m["competition"] for m in available.values()).items())),
        "limitations": ["No unused event files or outcomes inspected; eligible unused shot count is not yet known.", "Absent boolean keys are reported as absent, not assumed false.", "Prior final test is excluded from the new holdout pool.", "Metadata availability is not evidence of predictive benefit or causal importance."],
    }
    destination = ROOT / "reports/context"
    destination.mkdir(exist_ok=True)
    (destination / "audit.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"development_shots": len(seen), "counts": report["counts"]["ALL"], "unused_matches": len(available), "unused_by_competition": report["unused_by_competition"]}, indent=2))


if __name__ == "__main__":
    run()
