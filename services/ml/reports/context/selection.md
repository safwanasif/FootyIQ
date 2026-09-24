# Frozen context selection

The predeclared log-loss rule selected **context_boosted**. Selection and its artifact fingerprint were committed in `405fafd` before the fresh-test stage. This is development evidence, not the final promotion decision.

| Fixed candidate | Grouped CV log loss | Brier | ROC-AUC |
| --- | ---: | ---: | ---: |
| Geometry reference | 0.283883 | 0.079849 | 0.733194 |
| Context logistic | 0.269727 | 0.076110 | 0.771143 |
| Context boosted | 0.269717 | 0.076302 | 0.772056 |

Logistic and boosted context results are very close. Logistic has the lower Brier score, but the protocol selects by log loss; no rule was changed after inspecting these results. Five outer / three inner match-fold evaluation of the selection procedure produced log loss 0.269531, Brier 0.076212 and ROC-AUC 0.771886. Four outer folds chose boosting and one chose logistic.

The final selected fit uses the original 30,011 development shots, with geometry, body part, technique, shot type and play pattern. Missing categories map to UNKNOWN; rare categories are pooled within training folds. No new test shots are added to training. Full configurations, fold membership, calibration, slices and hashes are in [selection.json](selection.json).

Reproduction requires the pinned cached development sources and the locked Python dependencies. The script refuses to overwrite existing selection/final-test records; reproductions should use an isolated checkout/output copy rather than delete the published evidence.

```powershell
.\services\ml\venv\Scripts\python.exe services/ml/context_experiment.py select
# Only after recording the frozen selection:
.\services\ml\venv\Scripts\python.exe services/ml/context_experiment.py test
```

The serving artifact and frontend remain unchanged until a qualifying final-test decision and a separately verified integration.
