# FootyIQ model evaluation

3,770 shots across 147 matches; 350 goals (9.28%). 5 folds, grouped by match.

Each shot is evaluated by a model trained on other matches. The comparator predicts the training fold's goal rate for every test shot. Scores below pool all held-out predictions.

| Metric | Geometry model | Goal-rate baseline |
| --- | ---: | ---: |
| Log loss (lower is better) | 0.2697 | 0.3092 |
| Brier score (lower is better) | 0.0761 | 0.0842 |
| ROC-AUC (higher is better) | 0.7581 | 0.4810 |

## Calibration

Calibration compares predicted probability with observed scoring rate in fixed probability bins. Sparse bins are noisy; this is a diagnostic, not a fitted calibration correction.

| Probability bin | Shots | Mean prediction | Observed goal rate |
| --- | ---: | ---: | ---: |
| 0%–10% | 2586 | 4.57% | 4.72% |
| 10%–20% | 764 | 14.03% | 15.31% |
| 20%–30% | 278 | 24.01% | 17.63% |
| 30%–40% | 87 | 34.01% | 36.78% |
| 40%–50% | 35 | 44.41% | 51.43% |
| 50%–60% | 9 | 55.27% | 44.44% |
| 60%–70% | 7 | 65.33% | 71.43% |
| 70%–80% | 3 | 76.47% | 66.67% |
| 80%–90% | 1 | 80.49% | 100.00% |
| 90%–100% | 0 | — | — |

## Interpretation and limits

These scores evaluate the training procedure with distance and angle only. They are not a new, untouched external test of the serialized model. Match grouping prevents within-match leakage, but does not establish performance on future seasons or other competitions. No hyperparameter search or probability recalibration is performed.

The pooled baseline ROC-AUC need not equal 0.5: training goal rates vary across folds. Within each fold the constant comparator has AUC 0.5 when both outcomes are present.

The current serving artifact is left unchanged. Defender/goalkeeper locations, body part and shot technique are not model inputs. Reported results apply only to this local CSV; the ETL excludes penalties and shootouts.

## Reproducibility

Dataset SHA-256: `669cb66378c01e6c84633b8fa26ece6ba5ad94ca098bb5ce34836a705d4dddd6`

Exact test-match membership, fold metrics, calibration bins, and library versions are in `evaluation.json`.

```powershell
.\services\ml\venv\Scripts\python.exe services/ml/evaluate.py
```
