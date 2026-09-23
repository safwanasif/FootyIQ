"""Acquire a pinned, reproducible sample of senior men's StatsBomb Open Data."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import itertools
import json
import math
from pathlib import Path
import time
from urllib.request import Request, urlopen

import pandas as pd

ROOT = Path(__file__).resolve().parent
REVISION = "4b73468fc5b0f1950f9f66fada70ad3a4f9327cb"
BASE = f"https://raw.githubusercontent.com/statsbomb/open-data/{REVISION}/data"


def fetch(path):
    cache = ROOT / "data" / "source-cache" / REVISION / path
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    for attempt in range(4):
        try:
            with urlopen(Request(f"{BASE}/{path}", headers={"User-Agent": "FootyIQ-research"}), timeout=60) as response:
                raw = response.read()
            result = json.loads(raw)
            cache.parent.mkdir(parents=True, exist_ok=True)
            temporary = cache.with_suffix(".tmp")
            temporary.write_bytes(raw)
            temporary.replace(cache)
            return result
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def order_matches(matches):
    """Round robin competitions, with seeded hash ordering within each one."""
    groups = {}
    for match in matches:
        groups.setdefault(match["competition_id"], []).append(match)
    for group in groups.values():
        group.sort(key=lambda m: hashlib.sha256(f"42:{m['match_id']}".encode()).hexdigest())
    return [m for batch in itertools.zip_longest(*(groups[key] for key in sorted(groups)))
            for m in batch if m is not None]


def clean_shot(event, match):
    if event.get("type", {}).get("name") != "Shot":
        return None
    shot = event.get("shot", {})
    if shot.get("type", {}).get("name") == "Penalty" or event.get("period") == 5:
        return None
    location = event.get("location")
    if not isinstance(location, list) or len(location) < 2:
        return None
    try:
        x, y = map(float, location[:2])
    except (ValueError, TypeError):
        return None
    if not (math.isfinite(x) and math.isfinite(y) and 0 <= x <= 120 and 0 <= y <= 80):
        return None
    distance = math.hypot(120 - x, 40 - y)
    outcome = shot.get("outcome", {}).get("name")
    if not event.get("id") or not outcome or distance <= 0:
        raise ValueError(f"Invalid shot identity/outcome/geometry in match {match['match_id']}")
    angle = abs(math.atan2(36 - y, 120 - x) - math.atan2(44 - y, 120 - x))
    return {**match, "event_id": event["id"], "x": x, "y": y,
            "distance_to_goal": distance, "shot_angle": math.degrees(min(angle, 2 * math.pi - angle)),
            "is_goal": int(outcome == "Goal"), "shot_type": shot.get("type", {}).get("name"),
            "period": event.get("period"), "body_part": shot.get("body_part", {}).get("name")}


def acquire(target=30000):
    if target < 1:
        raise ValueError("Target must be positive")
    catalog = fetch("competitions.json")
    # Defined before looking at outcomes: modern senior men's seasons, 2015 onward.
    seasons = [s for s in catalog if s["competition_gender"] == "male"
               and not s["competition_youth"] and int(s["season_name"][:4]) >= 2015]
    matches = {}
    for season in seasons:
        for match in fetch(f"matches/{season['competition_id']}/{season['season_id']}.json"):
            row = {"match_id": match["match_id"], "match_date": match["match_date"],
                   **{key: season[key] for key in ["competition_id", "competition_name", "season_id", "season_name"]}}
            if row["match_id"] in matches:
                raise ValueError("Duplicate match in source catalog")
            matches[row["match_id"]] = row
    ordered = order_matches(matches.values())
    rows, provenance, seen = [], [], set()
    with ThreadPoolExecutor(max_workers=4) as executor:
        for start in range(0, len(ordered), 20):
            batch = ordered[start:start + 20]
            events = executor.map(lambda m: fetch(f"events/{m['match_id']}.json"), batch)
            for match, raw in zip(batch, events):
                cleaned = [row for event in raw if (row := clean_shot(event, match)) is not None]
                for row in cleaned:
                    if row["event_id"] in seen:
                        raise ValueError("Duplicate shot event ID")
                    seen.add(row["event_id"])
                rows.extend(cleaned)
                source = ROOT / "data/source-cache" / REVISION / f"events/{match['match_id']}.json"
                provenance.append({**match, "shots": len(cleaned), "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest()})
                if len(rows) >= target:
                    break
            print(f"Acquired {len(rows):,} eligible shots / {len(provenance)} complete matches", flush=True)
            if len(rows) >= target:
                break
    if len(rows) < target:
        raise ValueError(f"Only {len(rows)} eligible shots; target {target} not reached")
    output = ROOT / "data/expanded_shots.csv"
    pd.DataFrame(rows).to_csv(output, index=False, lineterminator="\n")
    manifest = {"source": "StatsBomb Open Data", "repository": "https://github.com/statsbomb/open-data",
                "revision": REVISION, "target_shots": target, "shots": len(rows),
                "selection": "Senior men, season start >= 2015; competition round robin, SHA256(42:match_id) order; whole matches until target",
                "exclusions": ["penalties", "shootouts", "missing/nonfinite/out-of-pitch locations"],
                "dataset_sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "matches": provenance}
    destination = ROOT / "reports/expanded"
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "dataset.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {output}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=int, default=30000)
    acquire(parser.parse_args().target)
