# FootyIQ v1: roadmap to deployment

## September 24 scope amendment

The user authorized one final shot-context experiment before release. This supersedes the earlier geometry-only freeze below; historical experiment results and promotion decisions remain unchanged.

1. Audit body part, technique, shot type and play pattern on development data; count unused matches without inspecting their outcomes. Record missingness and rare combinations.
2. Freeze a context experiment protocol before selection or fresh-test evaluation. Compare the current geometry baseline, context logistic regression and one small context nonlinear model. No further search rounds.
3. Integrate context controls only if the candidate passes the frozen promotion rule. Carry inputs through prediction, storage, revisit, comparison and export; preserve historical model identities. Otherwise ship the current model.
4. Polish onboarding, comparison explanations, error/retry states, collection privacy explanations and accessibility/mobile behavior.
5. Verify clean setup, dependency audits, Docker, migrations, meaningful regression coverage, persistence and measured latency.
6. Finish attribution, model card, screenshots, architecture diagram, demonstration and evidence-backed resume bullets.
7. Verify a free hosting arrangement, deploy with HTTPS/secrets/backups, test public workflows and cold starts, then tag v1.0.0.

After release, further improvements belong to a separate backlog and must not delay publishing or starting another project. Accounts, live feeds, defender/goalkeeper geometry and additional model searches remain deferred.

## Completed foundation and original experiment record

This is the release scope. Complete these phases, release v1, and move to another project. After release, make only necessary security, reliability, or compatibility fixes until a later deliberate project revisit. New ideas go to the deferred list, not the release checklist.

## Phase 1 — Evidence and source clarity (complete)

- Show the active model's 30,011-shot training/evaluation evidence and separate final-test results; preserve original World Cup research as historical evidence.
- List all sampled competitions, seasons, match counts and shot counts; link StatsBomb and reproducible reports.
- Generate compact frontend statistics from reports and fail checks when stale.
- Verify desktop/mobile layout and readable disclosure controls.

Done when the dashboard accurately explains both datasets without implying the expanded candidate is deployed.

## Phase 2 — One bounded model decision (complete)

Compare exactly three geometry-only candidates with fixed settings: baseline logistic regression, spline logistic regression, and small histogram gradient boosting. No additional feature controls, hyperparameter search, neural network, or recalibration round for v1.

1. Use nested match-grouped cross-validation on the expanded development data. Fit transformations only inside training folds. Rank candidates by pooled inner-fold log loss, breaking exact ties in favor of simpler models.
2. Select the final candidate using grouped cross-validation on all development matches, before opening new test outcomes.
3. Acquire at least 3,000 eligible shots in complete, previously unused matches from the same pinned source. Exclude all match IDs from both existing datasets. Use deterministic competition-balanced selection, with no outcome-dependent selection. Report the competitions actually available; this is a new-match test, not a future-season or unseen-competition benchmark.
4. Evaluate the frozen candidate, an expanded-data linear baseline, and the unchanged serving artifact once on those matches. Publish probability metrics, calibration, per-competition results and paired match-bootstrap uncertainty.
5. A nonlinear candidate qualifies for promotion only if log loss is lower and the upper endpoint of its paired 95% Brier-difference interval is below zero against both baselines. Also require finite bounded outputs across the pitch, sensible preset ordering and acceptable inference latency. Otherwise keep the serving baseline and close model experimentation for v1.

Experimental result: the boosted model did not qualify. The release subsequently adopted the already-evaluated 30,011-shot linear reference for broader training coverage, without an accuracy-improvement claim. See the [release record](../services/ml/reports/model-selection/release.md). The boosted candidate had slightly better point estimates on 3,014 unused shots, but both Brier intervals crossed zero. See the [final decision](../services/ml/reports/model-selection/decision.md). The protocol and selected candidate were committed in `bd4058e` before this final evaluation.

Done when a documented keep/replace decision exists. Do not change the rule or tune against the final test after seeing results. No promised accuracy target.

## Phase 3 — Freeze model and product behavior (complete)

- Release the evaluated expanded linear artifact; leave the unqualified boosted candidate undeployed.
- Add model identity to inference metadata and saved-shot records; retain a clear legacy label for historical predictions.
- Update frontend evidence and documentation together with the serving artifact.
- Finish keyboard, mobile, contrast and error/retry checks. Keep the existing save, revisit, compare and export scope.

Done when the model, UI claims and saved predictions are traceable and regression checks pass.

## Phase 4 — Release readiness

- Verify clean setup, dependency audits, full-stack tests and Docker rebuild.
- Complete StatsBomb attribution, including its requested logo, and document data/model limitations.
- Add README screenshots, an architecture diagram, a two-minute demo, and final résumé bullets supported by measured results.

Done when another developer can run the project and a reviewer can understand it without this conversation.

## Phase 5 — Free deployment and v1 release

- Select a currently available free hosting arrangement; document sleeping services and resource limits. Do not provision paid services.
- Configure same-site HTTPS, private credentials, proxy-aware request limits, database backup/recovery and health monitoring.
- Verify the public end-to-end workflow, cookie isolation, restart persistence and cold-start behavior.
- Add the public demo URL, tag v1.0.0 and close the release checklist.

Done means a working public demo, reproducible repository, documented evidence and a tagged release. Then stop feature development.

## Deferred beyond v1

Shot-context controls (headers, technique, pressure), accounts, live feeds, additional dashboards, large models, extra model-search rounds, and optional history-management features. These are not deployment blockers.
