# FootyIQ release checklist

The [fixed v1 roadmap](release-roadmap.md) controls scope. The September 24 amendment authorizes one final context audit and bounded experiment before release readiness; the original geometry experiment remains complete.

- [x] Audit development context and unused-match availability: complete categorical fields on 30,011 shots; 926 candidate unused matches. See [audit](../services/ml/reports/context/audit.md).
- [x] Freeze the new protocol, then complete one context model decision: context boosting qualifies on 3,009 fresh shots; [decision and limitations](../services/ml/reports/context/decision.md). Integrated; serving model is context-boosted-30k-v1.
- [x] Integrate qualifying context model across controls, prediction, versioned storage, revisit, comparison, export and generated evidence. Legacy context remains null.
- [x] Complete shot presets and context explanations, percentage-point comparisons with a non-causal interpretation, and collection cookie/retention/recovery copy.

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
- [x] Finish data attribution, including the official provider logo, source links, independence notice and versioned model/data evidence.
- [x] npm and Python requirements advisory audits: no known vulnerabilities reported on September 25; see [scope and limitations](dependency-audit.md).
- [x] Fresh CI checkout: npm clean install, Python dependencies, production build, full-stack browser workflow and clean deployment container verified in [run 36203384424](https://github.com/safwanasif/FootyIQ/actions/runs/36203384424).
- [x] Automated desktop/mobile accessibility, contrast, disclosure-keyboard and error-recovery checks passed in [release CI](https://github.com/safwanasif/FootyIQ/actions/runs/36206042342). See [verification scope](accessibility.md).
- [ ] Hands-on screen-reader review of pitch navigation and prediction announcements; not covered by axe.
- [x] README screenshot, deployment architecture diagram and written demo walkthrough.
- [x] [Silent automated demo recording](media/footyiq-demo.webm), with presentation pauses and verified results against isolated CI services.

## Deployment and release

- [x] Deploy on Vercel Hobby, Render Free and Neon Free; document sleeping services and free-tier constraints.
- [x] Configure same-site HTTPS frontend/API, production-only secrets, and proxy-aware request limits.
- [x] Verify public predictions, distance guard, cookies, isolation, save/revisit/export and persistence after a backend restart.
- [x] Verify a backup/restore rehearsal with realistic data in CI: [passing run](https://github.com/safwanasif/FootyIQ/actions/runs/36203108328).
- [x] Verify a production Neon archive using `scripts/backup-neon.ps1`: user-run PostgreSQL 18 restore passed September 25, recovering 2 saved shots and migrations 1–4 into an isolated local database. Private archive retained outside Git.
- [ ] Verify an idle-to-awake cold start.
- [x] Add an on-demand public health and inference workflow; no scheduled traffic to defeat free-tier sleep. Local public check passed in 0.81 seconds on September 25.
- [x] Finalize evidence-based résumé bullets and interview notes in the portfolio guide; prepare the two-minute recording script.
- [ ] Tag the final release after remaining checks are resolved.

The [public deployment](https://footy-iq-web.vercel.app/) is live. See [verification evidence](free-deployment.md). Current request limits use local process memory; restarts reset them and multiple instances need shared storage. The backend trusts forwarded client IPs only on requests authenticated with the private Vercel proxy secret. A final release tag remains pending the unfinished checks above.
