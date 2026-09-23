# Final v1 model decision

Keep serving baseline; close v1 model experimentation

Selected before opening final-test outcomes: **boosted**. 3,014 shots across 122 unused matches.

| Model | Log loss | Brier score | ROC-AUC |
| --- | ---: | ---: | ---: |
| candidate | 0.273682 | 0.076937 | 0.737211 |
| expanded_linear | 0.276327 | 0.077223 | 0.731070 |
| serving | 0.276620 | 0.077326 | 0.730279 |

## Predefined promotion rule

Lower log loss and a paired match-bootstrap 95% Brier-difference interval entirely below zero against BOTH the expanded linear reference and the unchanged serving artifact. Also require finite bounded pitch outputs, central chance above tight/long presets, and mean single inference below 100 ms with two threads. These criteria were fixed before the final test.

- Candidate minus expanded_linear: Brier difference -0.000286; 95% interval [-0.000827, 0.000199].
- Candidate minus serving: Brier difference -0.000389; 95% interval [-0.000980, 0.000133].

## Development evaluation

Five outer match folds evaluate the selection procedure; three inner match folds select among fixed candidates. The final candidate is selected using five-fold log loss across all development data. Transformations are fitted within training folds; tree early stopping is disabled to avoid an internal shot-level split.

Nested selection log loss: 0.282816; Brier: 0.079626. Expanded linear reference log loss: 0.283883; Brier: 0.079849.

## Scope and stopping point

Unused matches from selective open-data coverage; not a future-season test. No retuning after this result.

The final test excludes every match in both previous datasets. Competitions with no unused matches cannot appear in this test. Neither the original World Cup CV score nor expanded-data CV scores are directly comparable with these final-test scores. Candidate artifacts remain separate; the serving model is unchanged. Detailed calibration, competition results, source hashes, artifact hashes and numerical checks are in final-test.json.

Reproduce selection first, then the final test (reproduction is not a new independent experiment):

```powershell
.\services\ml\venv\Scripts\python.exe services/ml/model_selection.py
.\services\ml\venv\Scripts\python.exe services/ml/final_model_test.py
```
