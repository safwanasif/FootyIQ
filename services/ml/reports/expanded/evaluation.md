# FootyIQ model evaluation

30,011 shots across 1206 matches; 2882 goals (9.60%). 5 folds, grouped by match.

Each shot is evaluated by a model trained on other matches. The comparator predicts the training fold's goal rate for every test shot. Scores below pool all held-out predictions.

| Metric | Geometry model | Goal-rate baseline |
| --- | ---: | ---: |
| Log loss (lower is better) | 0.2839 | 0.3163 |
| Brier score (lower is better) | 0.0798 | 0.0868 |
| ROC-AUC (higher is better) | 0.7332 | 0.4889 |

## Calibration

Calibration compares predicted probability with observed scoring rate in fixed probability bins. Sparse bins are noisy; this is a diagnostic, not a fitted calibration correction.

| Probability bin | Shots | Mean prediction | Observed goal rate |
| --- | ---: | ---: | ---: |
| 0%–10% | 20209 | 5.22% | 5.42% |
| 10%–20% | 6782 | 13.96% | 14.27% |
| 20%–30% | 2093 | 24.10% | 20.31% |
| 30%–40% | 574 | 33.90% | 35.02% |
| 40%–50% | 207 | 44.17% | 44.93% |
| 50%–60% | 83 | 53.68% | 63.86% |
| 60%–70% | 38 | 65.07% | 68.42% |
| 70%–80% | 19 | 74.81% | 78.95% |
| 80%–90% | 6 | 82.97% | 100.00% |
| 90%–100% | 0 | — | — |

## Interpretation and limits

These scores evaluate the training procedure with distance and angle only. They are not a new, untouched external test of the serialized model. Match grouping prevents within-match leakage, but does not establish performance on future seasons or other competitions. No hyperparameter search or probability recalibration is performed.

The pooled baseline ROC-AUC need not equal 0.5: training goal rates vary across folds. Within each fold the constant comparator has AUC 0.5 when both outcomes are present.

The current serving artifact is left unchanged. Defender/goalkeeper locations, body part and shot technique are not model inputs. Reported results apply only to this local CSV; the ETL excludes penalties and shootouts.

## Reproducibility

Dataset SHA-256: `18a39a9e382115dde555bd3c1e73aeffd8ffc57582ba1de144277d4294de6340`

Exact test-match membership, fold metrics, calibration bins, and library versions are in `evaluation.json`.

```powershell
.\services\ml\venv\Scripts\python.exe services/ml/evaluate.py --data services/ml/data/expanded_shots.csv --output services/ml/reports/expanded
```
