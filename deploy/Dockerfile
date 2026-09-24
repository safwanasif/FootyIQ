FROM node:24-bookworm-slim AS api
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY services/api/package.json services/api/package.json
RUN npm ci --workspace services/api --include=dev --no-audit --no-fund
COPY services/api/tsconfig.json services/api/tsconfig.json
COPY services/api/src services/api/src
RUN npm run build --workspace services/api && npm prune --workspace services/api --omit=dev

FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=api /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=api /app/node_modules ./node_modules
COPY --from=api /app/services/api/dist ./services/api/dist
COPY services/ml/requirements.txt ./services/ml/requirements.txt
RUN pip install --no-cache-dir -r services/ml/requirements.txt
COPY services/ml/app.py services/ml/model_registry.py services/ml/shot_context.py services/ml/serving-model.json services/ml/shot-context.json services/ml/distance-support.json ./services/ml/
COPY services/ml/artifacts/context_boosted_30k_v1.pkl ./services/ml/artifacts/context_boosted_30k_v1.pkl
COPY deploy/start.py ./deploy/start.py
RUN useradd --create-home appuser
USER appuser
ENV NODE_ENV=production PYTHONUNBUFFERED=1 OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 ML_SERVICE_URL=http://127.0.0.1:5000
EXPOSE 10000
CMD ["python", "deploy/start.py"]
