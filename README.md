# FootyIQ

An interactive soccer expected-goals dashboard backed by a trained logistic-regression model. Place a shot on the attacking half, pin a chance to compare positions, and save it to PostgreSQL. The responsive collection supports revisiting chances and exporting the visible page as CSV. An in-app model section explains the measured results and limitations.

For a short demo walkthrough, engineering talking points, and evidence-based resume bullets, see the [portfolio guide](docs/portfolio.md).

## Architecture

`Next.js dashboard → Express API → FastAPI model service`

`Express API → PostgreSQL shot history`

The browser receives live predictions through the gateway. Saving sends only an ID and pitch coordinates; the API calculates distance and angle, requests a fresh model prediction, and stores the result. Repeated requests with the same ID and position return the original shot within the same collection. Database migrations run transactionally before the API starts listening.

Saved shots belong to an anonymous browser collection. A 256-bit random, HttpOnly, SameSite=Lax cookie identifies the visitor; only its SHA-256 hash is stored with shots. List, save, retry, and export queries all include that collection hash. Clearing cookies or changing browsers creates a new collection. This is browser-based separation, not an account system or account recovery service.

## Run locally

Requirements: Node.js 24, npm, and Docker Desktop with its engine running. Run from the repository root:

```powershell
npm ci
docker compose up -d --build --wait --wait-timeout 120
npm run dev:web
```

Open http://localhost:3000. Start with **Central chance**, **Tight angle**, or **Long range**. Click or drag on the pitch, or focus it and use arrow keys (Shift moves farther). Pin a chance and move to another position to compare probabilities in percentage points. Save a shot, then use **Revisit** in the collection to restore its position. History shows the prediction recorded at save time; revisiting requests a prediction from the currently loaded model. **Export page** downloads only the currently visible history page, preserving original numeric precision and unit labels.

Local ports: web `3000`, gateway `3001`, ML `5000`, PostgreSQL `5432`. Compose provides the gateway's database connection. For gateway development outside Docker, copy `services/api/.env.example` to `services/api/.env`, stop the container API to free port 3001, then run `npm run dev:api`.

The web app defaults to `http://localhost:3001`. Set `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` to use another gateway. Set `WEB_ORIGIN` on the gateway to the corresponding frontend origin.

## Verify

```powershell
npm test
npm run check
.\scripts\smoke-test.ps1 -RestartApi
```

The smoke test opens its own collection, creates a shot, retries the same save, restarts the API container, and verifies the shot remains in that collection exactly once. Its test shot does not appear in your browser collection. PostgreSQL uses the `pgdata` Docker volume; `docker compose down` retains it, while `docker compose down -v` deletes it.

For real PostgreSQL + ML integration tests while Compose is running:

```powershell
$env:DATABASE_URL = 'postgresql://footyiq_user:footyiq_pass@localhost:5432/footyiq'
npm run test:integration --workspace services/api
```

Integration tests create and remove an isolated schema. They check upgrading the old schema without deleting legacy shots, concurrent saves, database constraints, a real model prediction, persistence, and two-visitor HTTP isolation. Unit/API tests cover cookie attributes, origin checks, geometry, validation, pagination, retries, exports, and unavailable dependencies.

CI also runs Chromium end-to-end tests against a real Next.js build, API, PostgreSQL, and Python model service. They cover comparisons, saving presets, revisiting, CSV downloads, reload persistence, independent browser contexts, cleared cookies, and error recovery. Failing runs upload browser traces and reports.

To run browser tests locally, create a dedicated PostgreSQL test database and set `E2E_DATABASE_URL` to its connection string. Set `NEXT_PUBLIC_API_URL=http://localhost:3002`, run `npm run build`, install Chromium with `npx playwright install chromium`, then run `npm run test:e2e`. The runner starts ML/API/web on ports 5002/3002/3003. On Windows it uses the existing ML virtual environment; `ML_PYTHON` can override the executable. Never point these tests at your normal database. Restore `NEXT_PUBLIC_API_URL` afterward before building the normal app.

## Importing older local shots

The collection migration preserves older, unowned shots in PostgreSQL but does not show them to anonymous visitors. To move them into your browser collection:

1. Rebuild the containers and open the dashboard.
2. Expand **About your browser collection** under the collection and copy its collection ID.
3. Run the command below, replacing `YOUR_COLLECTION_ID`, then refresh the collection:

```powershell
docker compose exec api node services/api/dist/claim-legacy.js YOUR_COLLECTION_ID
```

This operator-only command moves unowned records into that collection. It does not reassign anyone else's shots, and conflicting IDs are left untouched. The collection ID is an import identifier; it cannot authenticate requests. There is no public legacy-import endpoint.

If containers fail:

```powershell
docker compose ps
docker compose logs --tail 100 db ml api
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Gateway and database readiness |
| GET | `/api/v1/session` | Initialize or resume the browser collection cookie |
| POST | `/api/v1/predict-proxy` | Predict from `distance_meters` and `angle_degrees` |
| POST | `/api/v1/shots` | Save `{ "id": "UUID", "x": 108, "y": 40 }` |
| GET | `/api/v1/shots?limit=10&offset=0` | Newest saved shots and `has_more` |
| GET | `/api/v1/shots/export?offset=0` | Download a 10-shot history page as CSV |

Saved-shot endpoints require the collection cookie and return 401 when it is missing or malformed. Browser fetches send credentials; cookie secrets never appear in response JSON or export URLs. Requests from unexpected origins return 403. Saved-shot coordinates use the attacking half of a 120 × 80 pitch (`60 ≤ x ≤ 119.9`, `0 ≤ y ≤ 80`). IDs support safe retries within each collection. Invalid inputs return 422; reuse of an ID for different coordinates in the same collection returns 409; unavailable storage returns 503. History page size is capped at 50.

## Model scope

The serving logistic-regression model, **geometry-linear-30k-v1**, was trained on **30,011 unique non-penalty shots from 1,206 matches across 12 men's competitions**. It uses distance to goal and the angle between the goalposts. Five-fold match-grouped evaluation produced **0.2839 log loss**, **0.0798 Brier score**, and **0.7332 ROC-AUC**. These cross-validation scores evaluate the training procedure; the released artifact was then fitted on all 30,011 training shots.

On **3,014 previously unused shots across 122 matches**, that exact artifact scored **0.2763 log loss**, **0.0772 Brier score**, and **0.7311 ROC-AUC**. Final-test shots were not added to training. The broader dataset is the reason for this release; no statistically established improvement over the original World Cup model is claimed.

See the [training evaluation](services/ml/reports/expanded/evaluation.md), [release decision](services/ml/reports/model-selection/release.md), and [active artifact manifest](services/ml/serving-model.json). The original World Cup artifact and its evaluation remain archived for comparison and rollback. The active artifact is included, so no retraining is required to run the app.

Predictions, saved shots and CSV exports carry the model ID. Existing saved rows retain their probabilities and receive a legacy/unversioned label. Retries preserve the original saved model identity; revisiting requests a prediction from the current model. Both API and ML containers must be rebuilt for this versioned contract.

This remains a geometry-only model: defenders, goalkeeper position, body part and game context are omitted. Coverage is selective, and future-season performance is unproven. See the in-app competition table for exact sampled seasons and counts.

## Current scope and next milestones

This version is a local demo with separate anonymous browser collections. It has no sign-in or cross-device recovery. Compose credentials are local development defaults. Local HTTP explicitly sets `COOKIE_SECURE=false`; HTTPS deployment must set it to `true` and serve the frontend and API on the same site so SameSite cookies work. `WEB_ORIGIN` must match the frontend origin exactly. Public deployment still needs deployment secrets, proxy-aware request limits, and hosting configuration.

Next: complete release readiness, then free-hosting deployment and the recorded demo.

## Expanded-data experiment

The research pipeline now acquires **30,011 unique shots across 1,206 matches and 12 senior men's competitions**, excluding penalties and shootouts. It uses StatsBomb Open Data revision `4b73468fc5b0f1950f9f66fada70ad3a4f9327cb`, seasons starting in 2015 onward, deterministic competition/match ordering, and complete matches. Downloads are cached locally; failures stop acquisition rather than silently dropping unavailable matches. Allow several GB of disk space for source event files. Raw data and candidate artifacts are not committed.

Data source: [StatsBomb Open Data](https://github.com/statsbomb/open-data). Its [source terms](https://github.com/statsbomb/open-data/blob/master/LICENSE.pdf) apply. The pinned source URLs, per-match hashes, exclusions and dataset fingerprint are in [the dataset manifest](services/ml/reports/expanded/dataset.json). Coverage is selective and is not representative of all football.

Reproduce using Python 3.12 or newer from the project root:

```powershell
python -m venv services/ml/venv
.\services\ml\venv\Scripts\python.exe -m pip install -r services/ml/requirements.txt
.\services\ml\venv\Scripts\python.exe services/ml/expand_data.py
.\services\ml\venv\Scripts\python.exe services/ml/scale_experiment.py
.\services\ml\venv\Scripts\python.exe -m unittest discover -s services/ml -p 'test_*.py'
```

If that virtual environment already exists, skip its creation. Acquisition uses the Python standard library plus the pinned pandas dependency; it does not require `statsbombpy`. The older World Cup ETL remains separate.

The [scaling comparison](services/ml/reports/expanded/comparison.md) evaluates nested training samples on the **same 6,022 held-out shots**. Brier score was 0.07498 for 3,785 training shots and 0.07512 for 23,989. The paired match-bootstrap interval crosses zero: this experiment does **not** establish an improvement from more data. Five-fold evaluation on the full expanded dataset is documented separately. Its AUC must not be directly compared with the original World Cup score because the evaluation populations differ.

The serving artifact is now `geometry_linear_30k_v1.pkl`, the evaluated full-data linear reference. Experimental boosted/spline work remains separate. The inference image includes only the active artifact and its manifest.

## API safeguards

Per-IP, per-minute limits: session initialization 30, predictions 240, saves 60, and collection reads/exports 120. Exhausted limits return HTTP 429 with `Retry-After`; memory is bounded. Limits are process-local and reset on restart. Forwarded IP headers are deliberately untrusted. Behind a reverse proxy, visitors will share the proxy's budget until deployment-specific trusted proxy configuration is implemented; multiple instances require a shared limiter.

Startup validates the database URL, ML service origin, port, frontend origin and cookie setting. Public frontend origins require HTTPS and secure cookies; local HTTP is supported explicitly. Model responses are checked for finite probabilities in [0,1], matching distance conversion and bounded text; upstream response bodies and connection URLs are not sent to browsers.

See the [release checklist](docs/release-checklist.md) for remaining model, accessibility, documentation and deployment work.

## Final v1 roadmap and model decision

The [fixed five-phase roadmap](docs/release-roadmap.md) defines the finish line: evidence UI, one model decision, model/version integration, release readiness, and free deployment. Extra model searches and feature ideas are deferred until after v1.

The bounded comparison tested linear, spline and small boosted geometry models using nested match-grouped evaluation. The selected boosted candidate then scored slightly better on **3,014 previously unused shots across 122 matches**, but its paired Brier uncertainty interval crossed zero against both references. The nonlinear candidate failed the rule committed before that test. We subsequently adopted the expanded linear reference for broader training coverage, without claiming an accuracy improvement. Model experimentation remains closed. Read the [release decision](services/ml/reports/model-selection/release.md).

The dashboard shows the current model's 30,011 training shots, matching cross-validation metrics, source coverage, and its separate final model test. It lists sampled competitions/seasons and links source manifests. Frontend statistics are generated from versioned reports, not separately maintained numbers:

```powershell
npm run evidence:sync
npm run check
```

Run the sync command whenever reports change, review the resulting UI copy, and commit the generated summary with the reports. Checks reject stale counts or a serving-artifact change without an updated evidence mapping. The frontend ships a compact summary rather than complete match manifests.
