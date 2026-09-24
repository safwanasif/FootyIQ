# Final context experiment protocol

Status: specified before fitting context models or opening new test outcomes. Commit this protocol before running selection. The audit uses only the existing development events and unused-match metadata.

## Data and inputs

Keep the pinned source, senior men's seasons starting in 2015 or later, complete-match sampling, and penalty/shootout/location exclusions. Development membership stays the existing 30,011 shots. Verify event IDs and source hashes when attaching context.

Inputs: distance, angle, body part, technique, shot type, and play pattern. These describe the shot and its build-up; this is a descriptive chance estimator, not a live pre-shot forecasting claim. Keep shot type and play pattern distinct: a corner-derived chance is not necessarily a direct corner shot. Do not use outcome, StatsBomb xG, end location, goalkeeper reaction, or post-shot information. Pressure and first-time flags are excluded from this experiment because absent keys must not silently be interpreted as observed negatives.

For each categorical input, replace missing values with UNKNOWN. Fit one-hot encoding inside each training fold, pooling categories with fewer than 100 training examples using min_frequency=100 and handle_unknown='infrequent_if_exist'. Unknown inference categories follow that fitted encoder's documented behavior. Do not create UI options for unsupported combinations merely because the model accepts them. Document observed combination counts and inference support policy before integration.

## Fixed candidates and selection

1. Geometry reference: existing LogisticRegression(max_iter=1000, random_state=42) on distance and angle.
2. Context logistic: standardized geometry plus the categorical encoder, LogisticRegression(C=1, max_iter=2000, random_state=42).
3. Context boosted: geometry plus the categorical encoder (dense output), HistGradientBoostingClassifier(max_iter=100, learning_rate=0.05, max_leaf_nodes=7, min_samples_leaf=80, l2_regularization=10, early_stopping=False, random_state=42).

Use 5 outer / 3 inner GroupKFold by match, all preprocessing fitted only on the training fold. Rank by pooled inner-fold log loss, exact ties preferring geometry, then context logistic, then context boosted. Select the final candidate with 5-fold grouped development log loss. Report log loss, Brier, ROC-AUC, calibration, per-competition and body-part counts/results. Treat failed convergence or missing predictions as failures, not an invitation to silently tune settings. Freeze the selected full-development artifact and hash before acquisition/evaluation of new test events.

## Fresh test

Exclude every match from expanded development, the original World Cup evaluation, and the previous 3,014-shot final test. Use only the remaining catalog matches, deterministic competition round robin and SHA256(42:match_id) ordering, taking whole matches until at least 3,000 eligible shots. Do not select matches by outcomes or context coverage. If insufficient eligible shots remain, record that limitation and keep the current serving model for v1; do not recycle the old test or broaden the source silently.

This is a new-match test within selective open-data coverage, not a future-season or unseen-league benchmark. Catalog counts alone do not establish that the shot target is feasible. Fetching extra files in a batch does not authorize examining unused outcomes.

## Promotion and stopping

Evaluate only the frozen selected candidate and current geometry-linear-30k-v1 artifact on the fresh test. A context candidate qualifies only if its log loss is lower and the upper endpoint of the paired match-cluster bootstrap 95% Brier-difference interval is below zero (1,000 resamples, seed 42). Report all metrics and intervals even if qualification fails.

Also require finite probabilities in [0,1], successful inference for documented supported contexts, no leakage or split overlap, and mean single-row inference below 100 ms over 100 calls with two threads. Review calibration and sparse slices as limitations; do not promise every slice improves. No universally monotonic ordering is assumed across different body parts or techniques.

Retain the active model on failure, insufficient fresh data, or selection of geometry. No additional tuning, calibration, candidate search, or final-test reuse for this release. Promotion requires matching application/schema/evidence changes and regression checks before serving the new artifact. Historical reports remain untouched.
