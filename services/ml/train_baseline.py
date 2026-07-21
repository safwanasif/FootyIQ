"""
============================================================================
FootyIQ ML Service — Baseline xG Model Training (train_baseline.py)
============================================================================
PURPOSE:
    Trains a baseline Logistic Regression xG model using distance_to_goal
    and shot_angle as features. Uses GroupKFold (grouped by match_id) to
    prevent data leakage — shots from the same match must never appear in
    both the training and test sets, since shots within a match are
    correlated (same teams, same game state, same players, same pitch
    conditions).

EVALUATION:
    Log Loss, ROC-AUC, and Brier Score are reported per fold and averaged
    across all folds on held-out data.

USAGE:
    (venv) PS ...\\services\\ml> python train_baseline.py

DEPENDENCIES:
    pandas, scikit-learn, numpy
============================================================================
"""

import joblib
import sys
import logging
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold
from sklearn.metrics import log_loss, roc_auc_score, brier_score_loss

# ============================================================================
# LOGGING CONFIGURATION
# ============================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("footyiq_train")

# ============================================================================
# CONFIG / CONSTANTS
# ============================================================================
SCRIPT_DIR = Path(__file__).resolve().parent
DATA_PATH = SCRIPT_DIR / "data" / "world_cup_shots.csv"
ARTIFACTS_DIR = SCRIPT_DIR / "artifacts"
MODEL_ARTIFACT_PATH = ARTIFACTS_DIR / "baseline_xg.pkl"

FEATURE_COLUMNS = ["distance_to_goal", "shot_angle"]
TARGET_COLUMN = "is_goal"
GROUP_COLUMN = "match_id"

N_SPLITS = 5  # Requested number of GroupKFold folds (auto-reduced if too few matches)
RANDOM_STATE = 42


# ============================================================================
# DATA LOADING
# ============================================================================
def load_dataset(path: Path) -> pd.DataFrame:
    """
    Load the cleaned shots CSV produced by etl.py and validate that all
    required columns are present before proceeding.
    """
    if not path.exists():
        logger.error(f"Dataset not found at {path}. Run etl.py first.")
        sys.exit(1)

    df = pd.read_csv(path)

    required_cols = FEATURE_COLUMNS + [TARGET_COLUMN, GROUP_COLUMN]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        logger.error(f"Dataset is missing required columns: {missing}")
        sys.exit(1)

    # Drop rows with nulls in any required column — model can't train on NaNs
    before = len(df)
    df = df.dropna(subset=required_cols)
    dropped = before - len(df)
    if dropped > 0:
        logger.info(f"Dropped {dropped} rows with missing required values.")

    logger.info(
        f"Loaded dataset: {df.shape[0]} shots across {df[GROUP_COLUMN].nunique()} matches."
    )
    return df


# ============================================================================
# GROUPED CROSS-VALIDATION TRAINING + EVALUATION
# ============================================================================
def train_and_evaluate(df: pd.DataFrame) -> None:
    """
    Trains a LogisticRegression model using GroupKFold cross-validation,
    grouped by match_id. This guarantees no single match's shots appear in
    both the train and test split of any fold — preventing data leakage
    from within-match correlation.

    For each fold:
        - Fit LogisticRegression on the training split.
        - Predict probabilities on the held-out test split.
        - Compute Log Loss, ROC-AUC, and Brier Score.

    Finally, prints the mean +/- std of each metric across all folds.
    """
    X = df[FEATURE_COLUMNS].to_numpy()
    y = df[TARGET_COLUMN].astype(int).to_numpy()
    groups = df[GROUP_COLUMN].to_numpy()

    n_groups = df[GROUP_COLUMN].nunique()
    n_splits = min(N_SPLITS, n_groups)
    if n_splits < 2:
        logger.error(
            f"Not enough distinct matches ({n_groups}) to run GroupKFold. Aborting."
        )
        sys.exit(1)
    if n_splits < N_SPLITS:
        logger.warning(
            f"Only {n_groups} matches available — reducing folds from "
            f"{N_SPLITS} to {n_splits}."
        )

    gkf = GroupKFold(n_splits=n_splits)

    fold_logloss, fold_auc, fold_brier = [], [], []

    logger.info(f"Starting GroupKFold cross-validation ({n_splits} folds)...")
    logger.info(f"Features: {FEATURE_COLUMNS} | Target: {TARGET_COLUMN}")

    for fold_idx, (train_idx, test_idx) in enumerate(gkf.split(X, y, groups), start=1):
        X_train, X_test = X[train_idx], X[test_idx]
        y_train, y_test = y[train_idx], y[test_idx]

        # Sanity check: confirm no match_id overlap between train/test (leakage guard)
        train_matches = set(groups[train_idx])
        test_matches = set(groups[test_idx])
        overlap = train_matches & test_matches
        if overlap:
            logger.error(
                f"  Fold {fold_idx}: DATA LEAKAGE DETECTED — overlapping match_ids: {overlap}"
            )
            sys.exit(1)

        model = LogisticRegression(random_state=RANDOM_STATE)
        model.fit(X_train, y_train)

        y_pred_proba = model.predict_proba(X_test)[:, 1]

        ll = log_loss(y_test, y_pred_proba, labels=[0, 1])
        auc = roc_auc_score(y_test, y_pred_proba)
        brier = brier_score_loss(y_test, y_pred_proba)

        fold_logloss.append(ll)
        fold_auc.append(auc)
        fold_brier.append(brier)

        logger.info(
            f"  Fold {fold_idx}: train_shots={len(train_idx)} test_shots={len(test_idx)} "
            f"test_matches={len(test_matches)} | "
            f"LogLoss={ll:.4f} ROC-AUC={auc:.4f} Brier={brier:.4f}"
        )

    # --- SUMMARY: mean +/- std across folds ---
    logger.info("=" * 72)
    logger.info("BASELINE MODEL EVALUATION — GroupKFold Cross-Validation Summary")
    logger.info("=" * 72)
    logger.info(
        f"  Log Loss  : {np.mean(fold_logloss):.4f} (+/- {np.std(fold_logloss):.4f})"
    )
    logger.info(
        f"  ROC-AUC   : {np.mean(fold_auc):.4f} (+/- {np.std(fold_auc):.4f})"
    )
    logger.info(
        f"  Brier Score: {np.mean(fold_brier):.4f} (+/- {np.std(fold_brier):.4f})"
    )
    logger.info("=" * 72)

    # --- Fit a final model on ALL data for reference/future export ---
    logger.info("Fitting final baseline model on full dataset (all folds combined)...")
    final_model = LogisticRegression(random_state=RANDOM_STATE)
    final_model.fit(X, y)

    coef = final_model.coef_[0]
    intercept = final_model.intercept_[0]
    logger.info(
        f"  Final model coefficients: distance_to_goal={coef[0]:.4f}, "
        f"shot_angle={coef[1]:.4f}, intercept={intercept:.4f}"
    )
    logger.info(
        "  Interpretation: negative distance coef = farther shots score less; "
        "positive angle coef = wider angle scores more."
    )

    # ------------------------------------------------------------------------
    # SERIALIZE: Persist the trained model to disk for standalone inference.
    # This decouples training (this script) from inference (predict.py) —
    # predict.py never touches the training CSV, only this artifact.
    # ------------------------------------------------------------------------
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(final_model, MODEL_ARTIFACT_PATH)
    logger.info("=" * 72)
    logger.info(f"MODEL ARTIFACT SAVED: {MODEL_ARTIFACT_PATH}")
    logger.info(f"  Feature order expected at inference: {FEATURE_COLUMNS}")
    logger.info("=" * 72)




# ============================================================================
# PIPELINE ORCHESTRATION
# ============================================================================
def run_training() -> None:
    logger.info("=" * 72)
    logger.info("FootyIQ Baseline xG Model — Training Pipeline (Phase 1c)")
    logger.info("=" * 72)

    df = load_dataset(DATA_PATH)
    train_and_evaluate(df)


if __name__ == "__main__":
    run_training()