# Does more training data help?

Fixed 20% match holdout per competition, hash seed 42; nested whole-match training subsets; no hyperparameter search

Dataset: 30,011 unique shots. Shared test set: 6,022 shots in 238 matches.

| Training sample | Shots | Log loss | Brier score | ROC-AUC |
| --- | ---: | ---: | ---: | ---: |
| mixed_3770 | 3785 | 0.27085 | 0.07498 | 0.72480 |
| mixed_10000 | 10007 | 0.27131 | 0.07511 | 0.72509 |
| mixed_all | 23989 | 0.27124 | 0.07512 | 0.72526 |
| world_cup_only | 2465 | 0.27133 | 0.07515 | 0.72527 |

Larger minus smaller mixed-sample Brier difference: 0.000140; paired match-bootstrap 95% interval [-0.000103, 0.000379]. Negative favors the larger sample. An interval crossing zero does not establish improvement.

## Limits

The old 0.758 World Cup cross-validation AUC uses different test data and cannot be compared directly with this table. The World Cup-only row is newly fitted using training matches only, not the old serving artifact. The 3,770-shot row samples mixed competitions; it isolates sample-size effects from a change in competition mix.

Open-data coverage is selective (some competitions contain only particular teams or finals). Competition balancing during acquisition does not make this a representative global football sample. This is a retrospective match holdout, not a prospective or unseen-competition test. The shared test set must not become a tuning set. A geometry-only model omits body part, pressure, defenders and goalkeeper position.

The candidate artifact was fitted on all expanded data after evaluation and is separate from baseline_xg.pkl. Serving model and original report remain unchanged. Exact membership, per-competition metrics, calibration and source provenance are in the adjacent JSON files.
