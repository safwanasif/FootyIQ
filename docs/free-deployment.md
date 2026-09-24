# Free deployment: Vercel + Render + Neon

Prepared configuration; no public resources have been provisioned yet. Use free plans only. Do not enable paid upgrades or enter billing details to work around free-tier limits without a separate decision.

## Layout

Vercel hosts `apps/web`. Its server routes proxy the existing API paths to one Render Docker service running Express and the Python model. Neon provides persistent PostgreSQL. Cookies stay on the Vercel domain, with their existing `/api/v1` path. Python listens only on the container loopback interface.

Render API paths require a shared server-side proxy secret; authenticated requests carry Vercel's platform-provided client IP for rate limiting. Express does not trust arbitrary forwarded headers. Never set this secret or a database URL in a `NEXT_PUBLIC_*` variable.

## Account setup

The user already has Vercel. Create free accounts at [Render](https://dashboard.render.com/) and [Neon](https://console.neon.tech/). Account terms and any login/security challenges must be completed by the account owner. No password or connection string needs to be pasted into chat.

## Deployment order

1. In Vercel, import `safwanasif/FootyIQ` as a Next.js project with root directory `apps/web`, including files outside the root directory. Use the repository npm lockfile and Node 24. Set `NEXT_PUBLIC_API_MODE=same-origin`; leave `NEXT_PUBLIC_API_URL` unset. The first deployment establishes the production `https://...vercel.app` origin; backend routes initially report incomplete setup.
2. In Neon, create a free PostgreSQL project in a region close to the chosen Render region. Copy its pooled TLS connection string into Render's secret `DATABASE_URL` setting. Use a new database for the public demo; do not migrate personal local collections by default.
3. In Render, create a Blueprint from this repository using `render.yaml`. It explicitly requests one free Docker web service. Supply `WEB_ORIGIN` as the exact Vercel production origin (no trailing slash) and `DATABASE_URL` from Neon. Render generates `DEPLOYMENT_PROXY_SECRET`. Automatic deploys are off until public verification is complete.
4. In Vercel, add server-only `BACKEND_ORIGIN` as the Render HTTPS origin and copy Render's generated `DEPLOYMENT_PROXY_SECRET` into the corresponding sensitive server setting. Restrict these values to Production, then redeploy. Do not give preview deployments access to production collections without an explicit origin policy.
5. Verify `/health`, predictions, body-part changes, distant-header abstention, save/revisit/export, and two separate browser collections. Verify restart persistence, cold-start recovery, and that direct API access without the proxy secret is rejected. Check actual container memory against the free plan before calling deployment complete.

## Free-tier limits and operations

[Render's free-service documentation](https://render.com/docs/free) says services sleep after 15 idle minutes and can take about a minute to wake. Its local filesystem is ephemeral, and its free PostgreSQL expires after 30 days, which is why this setup uses Neon. Do not run keep-alive traffic merely to defeat sleeping. The frontend explains that users may need to retry during startup.

Render currently lists a 512 MB free instance. The combined container must pass an actual memory-constrained run; local unit tests alone cannot prove hosting capacity. [Neon's plans](https://neon.com/docs/introduction/plans) have usage/storage limits that must be confirmed during account setup. A free demo is not an availability SLA.

Before tagging v1: complete dependency audits and attribution, capture screenshots/demo, verify a PostgreSQL backup and restore into a separate database, record the actual limits and public URL, and finish the release checklist. Use a private local backup with `pg_dump`/`pg_restore`; never commit database dumps or secrets. No v1 release is claimed until these gates and the public workflow pass.

## Local container check (PowerShell)

Docker is unavailable in the agent command environment. On the user's Docker installation:

```powershell
docker build -f deploy/Dockerfile -t footyiq-backend:preview .
docker run --rm --memory=512m -p 10000:10000 --env-file .env.deploy.local footyiq-backend:preview
```

Create `.env.deploy.local` locally (ignored by Git) with `PORT=10000`, the private test `DATABASE_URL`, `WEB_ORIGIN=http://localhost:3000`, and `COOKIE_SECURE=false`. For an existing Docker Desktop database, the host in this container's test connection URL is `host.docker.internal`, not `localhost`. Do not use that local HTTP/cookie configuration for public hosting.

In another PowerShell window: `Invoke-RestMethod http://localhost:10000/health`. Stop this preview with Ctrl+C. Production uses the Render Blueprint's HTTPS/secure-cookie settings.
