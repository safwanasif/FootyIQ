# v1 release: expanded-data linear model

The serving model is **geometry-linear-30k-v1**, fitted on all **30,011 unique non-penalty shots across 1,206 matches and 12 men's competitions**. This is the exact `expanded_linear` artifact evaluated in `final-test.json`, verified by its SHA-256 fingerprint. The final-test matches are not included in training.

The release adopts broader multi-competition training coverage and retains the interpretable linear algorithm. It does not claim a statistically established accuracy improvement. The earlier predefined promotion test concerned a nonlinear upgrade: the boosted candidate failed that rule and remains undeployed. That experiment and its historical decision are preserved in [decision.md](decision.md); this document records the subsequent expanded-linear release choice.

| Evidence | Shots | Log loss | Brier score | ROC-AUC |
| --- | ---: | ---: | ---: | ---: |
| Five-fold match-grouped evaluation of the training procedure | 30,011 | 0.283883 | 0.079849 | 0.733194 |
| Serving artifact on previously unused final-test matches | 3,014 | 0.276327 | 0.077223 | 0.731070 |
| Original World Cup artifact on the same final test | 3,014 | 0.276620 | 0.077326 | 0.730279 |

These are different evaluation populations; compare models only within the same test. Point estimates on the final test are slightly better than the original artifact, but this release is based on training coverage rather than a demonstrated accuracy gain. No new tuning or candidate search was performed after seeing final-test results.

## Artifact and data provenance

- Active artifact and checksum: [serving-model.json](../../serving-model.json).
- Acquisition revision, match IDs, counts and source hashes: [dataset.json](../expanded/dataset.json).
- Grouped evaluation and calibration: [evaluation.md](../expanded/evaluation.md).
- Frozen selection, final-test results and artifact fingerprints: [final-test.json](final-test.json).
- Original artifact retained at `artifacts/baseline_xg.pkl` for rollback; it is no longer the default inference artifact.

To reproduce the release artifact, acquire the expanded dataset and run `model_selection.py` with the pinned runtime. The resulting `artifacts/expanded_linear_reference.pkl` is the full-data linear fit. Its fingerprint must match the published final-test reference before it is copied to `artifacts/geometry_linear_30k_v1.pkl`. Do not refit using final-test rows.

## Runtime and historical predictions

The service loads the manifest once, verifies the artifact fingerprint, and exposes the same model ID in health and prediction responses. The gateway validates that ID and records it with each new saved result and CSV export. Existing rows are labeled `legacy-unversioned`; their probabilities are preserved without inventing a past model identity. Retrying an existing save retains its original model ID, even after an update. Revisiting coordinates requests a prediction from the current model.

The frontend derives its statistics from the active manifest and matching reports. A frontend/API model mismatch prevents displaying predictions against the wrong evidence. Rebuild both API and ML containers when installing this release.

Model experimentation remains closed for v1. Remaining work follows the fixed release roadmap.
