"""
============================================================================
FootyIQ ML Service — StatsBomb World Cup xG ETL Pipeline (etl.py)
============================================================================
PURPOSE:
    Extracts all FIFA World Cup (competition_id=43) shot events from the
    StatsBomb open data repository, flattens nested JSON structures,
    engineers geometric xG features (distance & shot angle), and writes a
    clean, model-ready CSV to services/ml/data/world_cup_shots.csv.

PIPELINE STAGES:
    1. EXTRACT   -> Pull competitions -> seasons -> matches -> shot events
    2. TRANSFORM -> Flatten nested dicts, filter penalties/shootouts,
                    engineer distance_to_goal & shot_angle features
    3. LOAD      -> Persist cleaned DataFrame to CSV for model training

USAGE:
    (venv) PS ...\\services\\ml> python etl.py

DEPENDENCIES:
    statsbombpy, pandas>=2.2.0, numpy
============================================================================
"""

import sys
import time
import math
import logging
from pathlib import Path

import numpy as np
import pandas as pd

try:
    from statsbombpy import sb
except ImportError as e:
    print(f"FATAL: statsbombpy is not installed in this environment: {e}")
    sys.exit(1)

# ============================================================================
# LOGGING CONFIGURATION
# ============================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("footyiq_etl")

# Silence statsbombpy's internal noisy warnings (credential/version notices)
logging.getLogger("statsbombpy").setLevel(logging.CRITICAL)

# ============================================================================
# GLOBAL CONFIG / CONSTANTS
# ============================================================================
COMPETITION_ID = 43  # FIFA World Cup (all seasons StatsBomb has open-sourced)

# StatsBomb pitch dimensions: 120 units long (x-axis) x 80 units wide (y-axis)
PITCH_LENGTH = 120.0
PITCH_WIDTH = 80.0

# Goal geometry (attacking direction assumed toward x=120)
GOAL_CENTER = (120.0, 40.0)
GOAL_POST_1 = (120.0, 36.0)  # near post
GOAL_POST_2 = (120.0, 44.0)  # far post

# Output location: services/ml/data/world_cup_shots.csv
SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = SCRIPT_DIR / "data"
OUTPUT_FILE = OUTPUT_DIR / "world_cup_shots.csv"

# Small delay between requests to avoid hammering the open data CDN
REQUEST_DELAY_SECONDS = 0.35


# ============================================================================
# EXTRACT: DISCOVER MATCHES
# ============================================================================
def get_world_cup_matches() -> pd.DataFrame:
    """
    Dynamically discover every World Cup season available in StatsBomb's
    open data and retrieve all matches for each season.

    Returns:
        DataFrame of all World Cup matches across all available seasons.
        Empty DataFrame if the competitions catalogue could not be fetched.
    """
    logger.info("Fetching competitions catalogue from StatsBomb open data...")
    try:
        competitions = sb.competitions()
    except Exception as e:
        logger.error(f"Failed to fetch competitions catalogue: {e}")
        return pd.DataFrame()

    if competitions is None or competitions.empty:
        logger.error("Competitions catalogue returned empty. Aborting.")
        return pd.DataFrame()

    wc_seasons = competitions[competitions["competition_id"] == COMPETITION_ID]
    if wc_seasons.empty:
        logger.warning(f"No seasons found for competition_id={COMPETITION_ID}.")
        return pd.DataFrame()

    season_list = wc_seasons["season_name"].tolist()
    logger.info(f"Found {len(wc_seasons)} World Cup season(s): {season_list}")

    all_matches = []
    for _, row in wc_seasons.iterrows():
        season_id = row["season_id"]
        season_name = row["season_name"]
        try:
            season_matches = sb.matches(
                competition_id=COMPETITION_ID, season_id=season_id
            )
            if season_matches is None or season_matches.empty:
                logger.warning(f"  Season {season_name}: no matches returned.")
                continue

            season_matches = season_matches.copy()
            season_matches["season_name"] = season_name
            all_matches.append(season_matches)
            logger.info(
                f"  Season {season_name}: {len(season_matches)} matches retrieved."
            )
        except Exception as e:
            logger.warning(f"  Season {season_name}: failed to fetch matches ({e}).")
            continue

        time.sleep(REQUEST_DELAY_SECONDS)

    if not all_matches:
        logger.error("No matches retrieved for any World Cup season.")
        return pd.DataFrame()

    return pd.concat(all_matches, ignore_index=True)


# ============================================================================
# EXTRACT: SHOT EVENTS PER MATCH
# ============================================================================
def extract_shots_from_match(match_id: int) -> pd.DataFrame:
    """
    Fetch all events for a single match and isolate 'Shot' type events.
    Designed to NEVER raise — any failure returns an empty DataFrame so the
    pipeline can continue processing remaining matches.

    Args:
        match_id: StatsBomb match identifier.

    Returns:
        DataFrame of raw shot events for this match (empty if unavailable).
    """
    try:
        events = sb.events(match_id=match_id, flatten_attrs=True)
    except Exception as e:
        logger.warning(f"  Match {match_id}: failed to fetch events ({e}). Skipped.")
        return pd.DataFrame()

    if events is None or events.empty or "type" not in events.columns:
        logger.warning(f"  Match {match_id}: no usable event data. Skipped.")
        return pd.DataFrame()

    shots = events[events["type"] == "Shot"].copy()
    if shots.empty:
        return pd.DataFrame()

    # match_id is not always included in events() output — attach explicitly
    shots["match_id"] = match_id
    return shots


# ============================================================================
# TRANSFORM: HELPERS
# ============================================================================
def extract_name_field(row: pd.Series, candidate_columns: list):
    """
    Robustly extract a human-readable name field from a StatsBomb event row.

    statsbombpy's `flatten_attrs` behavior can differ across versions —
    nested fields like {"id": 1, "name": "Left Foot"} may already be split
    into separate '..._name' columns, OR may still arrive as a raw dict.
    This helper checks multiple candidate column names and unwraps dicts
    if necessary, so the pipeline doesn't break on version mismatches.

    Args:
        row: A single row (Series) from the shots DataFrame.
        candidate_columns: Ordered list of column names to try.

    Returns:
        The extracted name string, or None if not found.
    """
    for col in candidate_columns:
        if col in row.index:
            val = row[col]
            if isinstance(val, dict):
                return val.get("name")
            if pd.notna(val):
                return val
    return None


def safe_get_xy(location):
    """
    Safely extract (x, y) floats from a StatsBomb 'location' field.

    StatsBomb locations are typically [x, y] lists, but malformed or
    missing data (nulls, wrong-length lists, non-numeric values) should
    never crash the pipeline — they are simply dropped.

    Args:
        location: Raw 'location' cell value from the events DataFrame.

    Returns:
        Tuple (x, y) as floats, or (None, None) if invalid.
    """
    if not isinstance(location, (list, tuple)) or len(location) < 2:
        return None, None
    try:
        x = float(location[0])
        y = float(location[1])
        return x, y
    except (TypeError, ValueError):
        return None, None


# ============================================================================
# FEATURE ENGINEERING: GEOMETRY
# ============================================================================
def compute_distance_to_goal(x: float, y: float) -> float:
    """
    Euclidean distance from the shot location (x, y) to the center of the
    goal (120, 40):

        distance = sqrt((120 - x)^2 + (40 - y)^2)

    Shorter distance generally correlates with higher xG.
    """
    gx, gy = GOAL_CENTER
    return math.sqrt((gx - x) ** 2 + (gy - y) ** 2)


def compute_shot_angle(x: float, y: float) -> float:
    """
    Angle (in degrees) subtended by the goalposts as seen from the shot
    location (x, y), computed via the vector/arctan2 method:

        1. Build vectors from the shot location to each goalpost.
        2. Compute each vector's angle relative to the x-axis via atan2.
        3. The absolute difference between these angles is the shot angle.

    A wider angle means a clearer, more open sight of goal (higher xG);
    a narrow/near-zero angle means the shot is heavily blocked by angle
    (e.g., a shot from a tight position near the byline).
    """
    p1x, p1y = GOAL_POST_1
    p2x, p2y = GOAL_POST_2

    v1_angle = math.atan2(p1y - y, p1x - x)
    v2_angle = math.atan2(p2y - y, p2x - x)

    angle = abs(v1_angle - v2_angle)
    # Normalize to the smaller angle between the two vectors (0–180 degrees)
    if angle > math.pi:
        angle = 2 * math.pi - angle

    return math.degrees(angle)


# ============================================================================
# TRANSFORM: FLATTEN + CLEAN + ENGINEER
# ============================================================================
def flatten_and_engineer(shots_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Convert raw, nested shot event rows into a clean, flat, model-ready
    DataFrame with engineered geometric features.

    Filters applied:
        - Drops shots with malformed/missing location data.
        - Drops penalty kicks (shot_type == 'Penalty').
        - Drops penalty shootout attempts (period == 5).

    Args:
        shots_raw: DataFrame of raw shot events across all matches.

    Returns:
        Cleaned, flattened DataFrame ready for CSV export.
    """
    records = []

    for _, row in shots_raw.iterrows():
        try:
            location = row.get("location", None)
            x, y = safe_get_xy(location)
            if x is None or y is None:
                continue  # malformed/missing coordinates — drop this shot

            shot_type = extract_name_field(row, ["shot_type_name", "shot_type"])
            period = row.get("period", None)

            # --- FILTER: exclude penalties and shootouts ---
            if shot_type == "Penalty":
                continue
            if period == 5:  # StatsBomb period 5 = penalty shootout
                continue

            outcome = extract_name_field(row, ["shot_outcome_name", "shot_outcome"])
            is_goal = 1 if outcome == "Goal" else 0

            body_part = extract_name_field(
                row, ["shot_body_part_name", "shot_body_part"]
            )
            player_name = extract_name_field(row, ["player_name", "player"])
            team_name = extract_name_field(row, ["team_name", "team"])

            record = {
                "match_id": row.get("match_id", None),
                "player_name": player_name,
                "team_name": team_name,
                "minute": row.get("minute", None),
                "period": period,
                "body_part": body_part,
                "shot_type": shot_type,
                "statsbomb_xg": row.get("shot_statsbomb_xg", np.nan),
                "x": x,
                "y": y,
                "is_goal": is_goal,
                "distance_to_goal": compute_distance_to_goal(x, y),
                "shot_angle": compute_shot_angle(x, y),
            }
            records.append(record)

        except Exception as e:
            # Never let one malformed row kill the whole pipeline
            logger.debug(f"Skipping malformed shot row: {e}")
            continue

    return pd.DataFrame.from_records(records)


# ============================================================================
# LOAD: PERSIST TO CSV
# ============================================================================
def save_dataset(df: pd.DataFrame) -> None:
    """Create the /data directory if needed and write the final CSV."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_FILE, index=False)


# ============================================================================
# PIPELINE ORCHESTRATION
# ============================================================================
def run_pipeline() -> None:
    logger.info("=" * 72)
    logger.info("FootyIQ ETL — StatsBomb World Cup Shot Extraction (Phase 1b)")
    logger.info("=" * 72)

    # --- STAGE 1: Discover matches ---
    matches = get_world_cup_matches()
    if matches.empty or "match_id" not in matches.columns:
        logger.error("No matches available. Aborting pipeline.")
        sys.exit(1)

    match_ids = matches["match_id"].dropna().unique().tolist()
    total_matches = len(match_ids)
    logger.info(f"Total matches queued for shot extraction: {total_matches}")

    # --- STAGE 2: Extract shot events per match ---
    all_shots = []
    matches_with_shots = 0
    matches_without_shots = 0

    for i, match_id in enumerate(match_ids, start=1):
        shots = extract_shots_from_match(int(match_id))
        if not shots.empty:
            all_shots.append(shots)
            matches_with_shots += 1
        else:
            matches_without_shots += 1

        if i % 25 == 0 or i == total_matches:
            logger.info(f"  Progress: {i}/{total_matches} matches processed...")

        time.sleep(REQUEST_DELAY_SECONDS)

    if not all_shots:
        logger.error("No shot events extracted from any match. Aborting.")
        sys.exit(1)

    raw_shots_df = pd.concat(all_shots, ignore_index=True)
    logger.info(
        f"Raw shot events collected: {len(raw_shots_df)} "
        f"(matches with shots: {matches_with_shots}, "
        f"matches skipped/empty: {matches_without_shots})"
    )

    # --- STAGE 3: Flatten, filter, engineer features ---
    logger.info("Flattening events and engineering geometric xG features...")
    clean_df = flatten_and_engineer(raw_shots_df)

    if clean_df.empty:
        logger.error("No valid shots remained after cleaning. Aborting.")
        sys.exit(1)

    # Drop any residual rows missing critical modeling fields
    before_dropna = len(clean_df)
    clean_df = clean_df.dropna(subset=["x", "y", "is_goal", "distance_to_goal"])
    dropped = before_dropna - len(clean_df)
    if dropped > 0:
        logger.info(f"Dropped {dropped} rows with missing critical fields.")

    # --- STAGE 4: Load (persist to CSV) ---
    save_dataset(clean_df)

    # --- SUMMARY ---
    goal_count = int(clean_df["is_goal"].sum())
    goal_rate = goal_count / len(clean_df) if len(clean_df) else 0.0

    logger.info("=" * 72)
    logger.info("ETL PIPELINE COMPLETE")
    logger.info(f"  Matches processed:      {total_matches}")
    logger.info(f"  Matches with shot data: {matches_with_shots}")
    logger.info(f"  Total shots in dataset: {len(clean_df)}")
    logger.info(f"  Goals in dataset:       {goal_count} ({goal_rate:.2%} conversion)")
    logger.info(f"  Final dataset shape:    {clean_df.shape}")
    logger.info(f"  Saved to:               {OUTPUT_FILE}")
    logger.info("=" * 72)


if __name__ == "__main__":
    run_pipeline()