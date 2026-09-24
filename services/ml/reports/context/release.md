# Context model integration

Release ID: `context-boosted-30k-v1`. The active artifact is an exact copy of the frozen, qualifying context candidate; its SHA-256 is unchanged from selection. See [decision.md](decision.md) for the experiment, scores and calibration limitations.

The application exposes 38 combinations observed at least 100 times in development. This product restriction excludes sparse combinations; published test metrics describe the full fresh test, not a separately evaluated supported-only subset. API, ML and UI share checked copies of `shot-context.json`; evidence verification fails if they drift from the audit.

Defaults are Right Foot, Normal, Open Play, Regular Play. Omitted API context uses these defaults for compatibility; explicit partial, unknown or unsupported combinations fail validation. The UI labels defaults and links selectors to supported combinations. This support rule does not guarantee reliable extrapolation to every pitch location.

Migration 4 adds nullable JSON context. Old records retain probabilities/model identity and null context. New saves store complete context. Idempotency compares coordinates and each context field, including after concurrent conflicts. CSV adds four context columns; old records export blank context. Revisit explicitly explains defaulting old records; pinned comparisons restore their context.

Deployment requires rebuilding both backend images and the frontend. The gateway rejects predictions from an unexpected model version; the browser checks model identity against generated evidence. The previous geometry artifact is preserved in Git for rollback, but rollback must coordinate API/UI contracts and evidence rather than replace the pickle alone.

Verification includes 17 ML tests, API regression tests, isolated-schema real-model migration/persistence tests, production compilation and browser checks at desktop and 360px. Browser automation in CI additionally covers context save/revisit/export and collection isolation. Public hosting and the final release-readiness audit remain separate phases.
