# FootyIQ

An interactive soccer expected-goals dashboard backed by a trained logistic-regression model. Place a shot on the attacking half, inspect its predicted goal probability, and save it to PostgreSQL for later comparison.

## Architecture

`Next.js dashboard → Express API → FastAPI model service`

`Express API → PostgreSQL shot history`

The browser receives live predictions through the gateway. Saving sends only an ID and pitch coordinates; the API calculates distance and angle, requests a fresh model prediction, and stores the result. Repeated requests with the same ID and position return the original shot. Database migrations run transactionally before the API starts listening.

## Run locally

Requirements: Node.js 24, npm, and Docker Desktop with its engine running. Run from the repository root:

```powershell
npm ci
docker compose up -d --build --wait --wait-timeout 120
npm run dev:web
```

Open http://localhost:3000. Click or drag on the pitch, or focus it and use arrow keys (Shift moves farther). Save a shot, then use **Revisit** in history to restore its position. History shows the prediction recorded at save time; revisiting requests a prediction from the currently loaded model.

Local ports: web `3000`, gateway `3001`, ML `5000`, PostgreSQL `5432`. Compose provides the gateway's database connection. For gateway development outside Docker, copy `services/api/.env.example` to `services/api/.env`, stop the container API to free port 3001, then run `npm run dev:api`.

The web app defaults to `http://localhost:3001`. Set `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` to use another gateway. Set `WEB_ORIGIN` on the gateway to the corresponding frontend origin.

## Verify

```powershell
npm test
npm run check
.\scripts\smoke-test.ps1 -RestartApi
```

The smoke test creates a shot, retries the same save, restarts the API container, and verifies the shot remains in history exactly once. It leaves that shot visible for inspection. PostgreSQL uses the `pgdata` Docker volume; `docker compose down` retains it, while `docker compose down -v` deletes it.

For real PostgreSQL + ML integration tests while Compose is running:

```powershell
$env:DATABASE_URL = 'postgresql://footyiq_user:footyiq_pass@localhost:5432/footyiq'
npm run test:integration --workspace services/api
```

Integration tests create and remove an isolated schema. They check repeatable migrations, concurrent saves, database constraints, a real model prediction, and committed data through a separate connection. Unit/API tests cover geometry, validation, pagination, retries, and unavailable dependencies. CI runs unit/API tests, lint, and builds.

If containers fail:

```powershell
docker compose ps
docker compose logs --tail 100 db ml api
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Gateway and database readiness |
| POST | `/api/v1/predict-proxy` | Predict from `distance_meters` and `angle_degrees` |
| POST | `/api/v1/shots` | Save `{ "id": "UUID", "x": 108, "y": 40 }` |
| GET | `/api/v1/shots?limit=10&offset=0` | Newest saved shots and `has_more` |

Saved-shot coordinates use the attacking half of a 120 × 80 pitch (`60 ≤ x ≤ 119.9`, `0 ≤ y ≤ 80`). IDs support safe retries. Invalid inputs return 422; reuse of an ID for different coordinates returns 409; unavailable storage returns 503. History page size is capped at 50.

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

This version is a local, single-user demo with one shared shot history and no account isolation. Compose credentials are local development defaults. Public deployment still needs a deliberate access model, deployment secrets, request limits, and production configuration.

Next: prepare access controls and production deployment configuration, then record a short end-to-end demo.
