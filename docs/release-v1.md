# FootyIQ v1.0.0 release notes (candidate)

Live demo: https://footy-iq-web.vercel.app/

## Product

- Interactive pitch with keyboard controls, contextual expected-goals estimates, pinned comparisons and explicit unsupported-distance messages.
- Anonymous browser collections with save/revisit, versioned predictions and CSV export.
- Model evidence, competition coverage, source attribution and limitations available inside the app.

## Model evidence

The deployed `context-boosted-30k-v1` model was trained on 30,011 non-penalty shots across 1,206 matches and 12 senior men's competitions. On 3,009 fresh shots from 121 separate matches it achieved ROC-AUC 0.819 and Brier score 0.07928, a 6.2% relative reduction against the geometry baseline on the same test set. These are probability evaluation results, not a percent-accuracy claim or an unseen-competition benchmark.

The earlier geometry-only scaling experiment did not establish an improvement from more rows. It remains separate from the later qualifying context experiment. No new model search is part of this release.

## Engineering and operations

Next.js runs on Vercel, the Express gateway and FastAPI model share a Render Docker service, and Neon stores collections. Production credentials are server-only. Request validation, bounded rate limits, authenticated proxy requests, transactional migrations and idempotent saves protect the application boundary. CI checks API/model behavior, a full browser workflow, deployment-container operation and database backup/restore.

## Known limits

- Free backend hosting sleeps after inactivity; initial requests may require a retry after about a minute.
- Collections are tied to a browser cookie. There are no accounts or cross-device recovery.
- Context and distance support checks do not guarantee calibration at every location. Defender/goalkeeper positions and dominant foot are not modeled.
- Request limits are per process, not a distributed quota system.
- Advisory audits are point-in-time checks. Automated accessibility checks are not certification or a substitute for assistive-technology testing.

## Release status

This is a release candidate document, not evidence that the release tag exists. The [checklist](release-checklist.md) records completed verification and remaining items. Promote only after its required checks are resolved; do not add features to finish the release.

## Maintenance policy

After v1, limit active work to reproducible bugs, security updates, compatibility fixes and availability issues. New features and model experiments are deferred until a deliberate future revisit. Check the public demo on demand before sharing it; avoid scheduled keep-alive traffic on the free backend.
