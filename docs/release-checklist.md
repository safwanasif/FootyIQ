# FootyIQ release checklist

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

- [ ] Model improvement experiment: predefine candidate features/model families, compare with nested match-grouped evaluation, then use a new untouched final test. Do not tune against the published scaling holdout.
- [ ] Decide whether a validated candidate should replace the serving model; version the model and its evidence together.
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
