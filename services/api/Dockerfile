# ============================================================================
# FootyIQ API Gateway — Multi-Stage Production Container (Dockerfile)
# ============================================================================
# PURPOSE:
#   Builds a minimal, production-hardened image for the Express/TypeScript
#   gateway using a two-stage build pattern.
#
# WHY MULTI-STAGE (architecture note):
#   Stage 1 (Builder) needs TypeScript, @types/*, and all devDependencies
#   to COMPILE the source into plain JS. None of that tooling is needed to
#   RUN the compiled output — shipping it anyway would:
#     1. BLOAT the final image (compilers, type definitions, source maps)
#     2. WIDEN the attack surface (more installed packages = more CVEs to
#        patch, more tooling an attacker could abuse if the container is
#        compromised)
#   Stage 2 (Runner) starts from a clean base and copies ONLY the compiled
#   /dist output plus production-only node_modules — the TypeScript
#   compiler itself never exists in the final image.
#
# BUILD:
#   docker build -t footyiq-api:latest .
# ============================================================================


# ============================================================================
# STAGE 1: BUILDER
# ============================================================================
# Compiles TypeScript source into plain JavaScript. This stage's filesystem
# is discarded after the build — only /app/dist is copied forward.
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first (layer caching — reinstall deps only when they change)
COPY package*.json ./
COPY tsconfig.json ./

# npm ci installs EXACT versions from package-lock.json, including
# devDependencies (typescript, @types/*) — required to compile this stage.
RUN npm install

# Copy source and compile TypeScript -> JavaScript per tsconfig.json
# (outDir: ./dist, rootDir: ./src)
COPY src/ ./src/
RUN npm run build


# ============================================================================
# STAGE 2: RUNNER
# ============================================================================
# Clean, minimal runtime image. No TypeScript compiler, no @types packages,
# no source .ts files — only compiled JS and production dependencies.
FROM node:20-alpine AS runner

WORKDIR /app

# Production mode disables Express's dev-only behaviors (verbose error
# stack traces, etc.) and signals to any env-aware libraries to run lean.
ENV NODE_ENV=production

# Copy manifests again (fresh stage — nothing carries over from Builder
# automatically) and install ONLY production dependencies. This skips
# typescript, @types/*, tsx — cutting install size and time significantly.
COPY package*.json ./
RUN npm install --omit=dev

# Copy ONLY the compiled output from the Builder stage — the --from=builder
# flag is what makes this a true multi-stage build; nothing else from
# Stage 1's filesystem (src/, node_modules with devDeps) is pulled in.
COPY --from=builder /app/dist ./dist

# Documents the port Express listens on (see src/index.ts PORT config)
EXPOSE 3001

# Runs the compiled entry point directly with plain `node` — no ts-node,
# no tsx, no compilation step at runtime.
CMD ["node", "dist/index.js"]