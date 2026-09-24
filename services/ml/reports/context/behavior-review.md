# Serving behavior review

User observation: distant headers and footed shots can look similar, and the right foot sometimes has a small advantage. Investigated the released artifact without fitting any new model or revisiting test selection.

All probes used centerline geometry, Normal technique, Open Play shot type and Regular Play build-up. Percentages below describe the underlying model before the new distance serving guard.

| Distance (yards) | Head | Left foot | Right foot |
| --- | ---: | ---: | ---: |
| 12 | 6.98% | 25.31% | 26.32% |
| 25 | 3.35% | 4.26% | 4.26% |
| 35 | 1.83% | 1.98% | 1.98% |
| 45 | 1.94% | 2.11% | 2.11% |
| 60 | 2.07% | 2.25% | 2.25% |

There are zero training headers beyond 35 yards (all techniques/build-ups). Only 44 left-foot and 124 right-foot training shots exceed 45 yards. The default header context has 794 training shots spanning approximately 2.37-22.92 yards. Its aggregate context count does not establish support at long distances.

Histogram boosting partitions features into regions. It can flatten, change in steps, or return non-monotonic estimates in sparse regions; it does not enforce football physics or a zero-probability rule for implausible combinations. Similar extrapolated probabilities are a model limitation, not evidence that a distant header is as effective as a kick. Right foot is not always favored, as the probes show. The data has more right-foot shots, but count imbalance alone does not prove the cause of a particular probability difference. Player dominant foot, weak-foot ability and signed lateral position are not model inputs.

## Product correction

Derive distance bounds for each supported context from frozen development data only. Withhold predictions outside that context's observed distance range in the frontend, gateway and ML service. Do not replace those estimates with invented zeroes or retrain against the observed final test. Within the range, sparse geometry and calibration limitations still apply. The previously published metrics describe the full test before this serving restriction; they are not rebranded as supported-only accuracy.

The UI now distinguishes **Direct free-kick shot** from **Attack from a free kick**. For example, a free-kick cross followed by a header is an in-play shot in an attack from a free kick. Stored StatsBomb category values are unchanged. See the [StatsBomb event specification](https://github.com/statsbomb/open-data/blob/master/doc/StatsBomb%20Open%20Data%20Specification%20v1.1.pdf).

Model artifact and model ID remain unchanged: this is a serving support rule and labeling improvement, not a newly evaluated model. Any future fitting needs a newly declared evaluation design and fresh evidence.
