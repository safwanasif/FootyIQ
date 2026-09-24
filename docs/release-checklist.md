# FootyIQ release checklist

The [fixed v1 roadmap](release-roadmap.md) controls scope. The September 24 amendment authorizes one final context audit and bounded experiment before release readiness; the original geometry experiment remains complete.

- [x] Audit development context and unused-match availability: complete categorical fields on 30,011 shots; 926 candidate unused matches. See [audit](../services/ml/reports/context/audit.md).
- [ ] Freeze the new protocol, then complete one context model decision.
- [ ] Integrate context throughout the app only if promotion qualifies.
- [ ] Complete onboarding, comparison explanations and collection privacy copy.

## Completed

- [x] Interactive, responsive shot comparison and persistent browser collections.
- [x] Isolation, idempotent saves, CSV export and transactional database migrations.
- [x] Full-stack Chromium regression workflow with PostgreSQL and the ML service.
- [x] Model response validation and sanitized upstream error messages.
- [x] Bounded single-process request limits and startup configuration validation.
- [x] Reproducible expanded dataset: 30,011 unique non-penalty shots, 1,206 complete matches, 12 men's competitions.
- [x] Pinned source revision, per-match source hashes, dataset fingerprint and exact evaluation membership.
- [x] Fixed-holdout sample-size experiment and match-bootstrap uncertainty. No demonstrated gain from more rows for this geometry-only model; serving model preserved.

## Before deployment

- [x] Model improvement experiment: three predefined geometry models, nested match-grouped evaluation, and 3,014 unused final-test shots. The candidate did not pass the predefined promotion rule; retain the linear algorithm; release its evaluated expanded-data fit for broader coverage.
- [x] Make the final keep/replace decision: retain linear regression, adopt the 30,011-shot fit for coverage, and close model experimentation.
- [x] Add serving model identity to inference metadata and saved shots; version the model and its evidence together.
- [ ] Finish data attribution, including the provider's requested logo, and model/data documentation.
- [ ] Fresh-install verification and Python dependency security audit alongside npm audit.
- [ ] Final keyboard, screen-reader, contrast, mobile and error-state review.
- [ ] README screenshots, architecture diagram and a concise demo recording.

## Deployment and release

- [ ] Choose a free hosting layout after the project is ready; confirm current free-tier constraints.
- [ ] Configure same-site HTTPS frontend/API, secrets, database backups, and proxy-aware request limits.
- [ ] Verify public cookies, persistence, cold starts and the complete workflow.
- [ ] Configure uptime checks, tag a release, and finalize accurate résumé bullets and interview notes.

Deployment is intentionally pending. Current request limits use local process memory; restarts reset them and multiple instances need shared storage. Proxy trust remains disabled until the actual hosting topology can be configured safely.
