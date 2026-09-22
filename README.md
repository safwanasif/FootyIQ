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

The baseline uses distance to goal and the angle between the goalposts. Evaluation on the local dataset of **3,770 shots from 147 matches**, using five folds grouped by match, produced **0.2697 log loss**, **0.0761 Brier score**, and **0.7581 ROC-AUC**. The training-fold goal-rate comparator scored 0.3092 log loss and 0.0842 Brier score. These are out-of-fold scores for the training procedure, not a separate external test of the serving artifact.

See [the evaluation report](services/ml/reports/evaluation.md) for calibration, limitations, dataset fingerprint, and exact fold membership in the companion JSON. The 20–30% prediction bin averaged 24.01% predicted probability versus 17.63% observed goals; higher-probability bins have few examples. The serialized baseline model is included so local inference can start without retraining.

With the existing ML environment, reproduce the report without changing the serving model:

```powershell
.\services\ml\venv\Scripts\python.exe -m unittest discover -s services/ml -p test_evaluate.py
.\services\ml\venv\Scripts\python.exe services/ml/evaluate.py
```

For a fresh environment, create a Python 3.12+ virtual environment at `services/ml/venv` and install `services/ml/requirements.txt`. Evaluation requires the local `services/ml/data/world_cup_shots.csv`, which is not committed. The dataset SHA-256 in the report identifies the evaluated snapshot; regenerating with `etl.py` additionally requires `statsbombpy` and may retrieve changed upstream data. CI tests the evaluation logic using synthetic fixtures, rather than publishing scores from synthetic data.

This is a geometry-only baseline. It omits goalkeeper and defender positions, shot technique, body part, and game context. Quality labels in the UI are illustrative probability buckets. The model treats StatsBomb coordinate units as yards and converts API meters accordingly. External validation on other competitions or future seasons is still needed before making broader performance claims.

## Current scope and next milestones

This version is a local demo with separate anonymous browser collections. It has no sign-in or cross-device recovery. Compose credentials are local development defaults. Local HTTP explicitly sets `COOKIE_SECURE=false`; HTTPS deployment must set it to `true` and serve the frontend and API on the same site so SameSite cookies work. `WEB_ORIGIN` must match the frontend origin exactly. Public deployment still needs deployment secrets, request limits, and production configuration.

Next: add request limits and finish production configuration before a free-hosting deployment and recorded demo.
