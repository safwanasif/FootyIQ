# Build from the repository root using the shared npm lockfile.
FROM node:24-alpine AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY services/api/package.json ./services/api/package.json

FROM manifests AS builder
RUN npm ci --workspace services/api --include=dev --no-audit --no-fund
COPY services/api/tsconfig.json ./services/api/tsconfig.json
COPY services/api/src ./services/api/src
RUN npm run build --workspace services/api

FROM manifests AS runner
ENV NODE_ENV=production
RUN npm ci --workspace services/api --omit=dev --no-audit --no-fund
COPY --from=builder /app/services/api/dist ./services/api/dist
USER node
EXPOSE 3001
CMD ["node", "services/api/dist/index.js"]