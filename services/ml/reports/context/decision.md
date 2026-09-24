# Final context decision: qualifies for integration

The frozen context-boosted candidate passes the predefined promotion rule on **3,009 previously unused shots from 121 matches**. It remains a research artifact until application integration and regression checks are complete. The active service still uses geometry-linear-30k-v1.

| Same fresh test | Log loss | Brier score | ROC-AUC |
| --- | ---: | ---: | ---: |
| Current geometry model | 0.292301 | 0.084560 | 0.776504 |
| Frozen context model | 0.272219 | 0.079284 | 0.819419 |

Brier score is approximately 6.24% lower relative to the current model on this test. The paired whole-match bootstrap difference (candidate minus current) is -0.005277, with 95% interval [-0.006987, -0.003655], using 1,000 resamples and seed 42. Log loss is also lower. This supports the predefined decision; ROC-AUC is a ranking metric, not percent prediction accuracy.

Mean single-row local inference was 6.41 ms over 100 calls with two threads, below the 100 ms threshold. Finite bounded inference passed for all 130 observed development context combinations at four representative geometries. This is a numerical check, not validation of every possible pitch/context combination or a production latency measurement.

## Limitations that remain visible

- This fresh test covers available matches in four leagues, not every training competition or a future season. No claims of universal generalization.
- Calibration is imperfect: the 20-30% bin averaged 24.6% predicted versus 33.7% observed over 205 shots. The 30-40% bin averaged 35.0% predicted versus 50.0% observed over 70 shots. Higher bins are small and uncertain. No further calibration fitting against this test is permitted.
- Only five test shots have body part Other; their metrics cannot justify a separate performance claim.
- Inputs describe the shot and build-up. This is not a real-time pre-shot forecasting model or a causal explanation of how changing technique changes scoring chance.
- Development still contains 30,011 shots. The new 3,009 test shots and previous 3,014 test shots are excluded from candidate training.

## Traceability and next stage

Protocol committed in `d818745`; selected artifact hash and selection results committed in `405fafd` before fresh-test acquisition/evaluation. Full source membership and hashes, calibration, slices and decision evidence are in [final-test.json](final-test.json). The candidate artifact SHA-256 is `709e39a78cea77b4fa9cf5b5eae7f0676e33d0620ca285f795148baf3ed43556`.

Close model search for v1. Next integrate supported context controls, request validation, versioned storage, revisit/comparison/export and generated model evidence together. Restrict the UI to documented supported combinations and explain defaults; never silently invent context for legacy saved shots. Preserve the current model as rollback. Do not claim this candidate is deployed until that integration is verified.
