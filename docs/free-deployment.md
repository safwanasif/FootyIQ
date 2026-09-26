# Free deployment: Vercel + Render + Neon

Public deployment is live (2026-09-25); the broader v1 release gates below remain open. Use free plans only. Do not enable paid upgrades or enter billing details to work around free-tier limits without a separate decision.

## Provisioning status

- Vercel project `footy-iq-web`: connected production deployment is Ready on Hobby at https://footy-iq-web.vercel.app, from commit `1106177`, with Next.js root `apps/web` and `NEXT_PUBLIC_API_MODE=same-origin`. The backend origin and proxy secret are restricted to Production.
- Neon project `footyiq`: created on the Free plan in AWS US West 2 (Oregon), PostgreSQL 18, with a fresh `production` branch. No local collections were imported.
- Render Blueprint `footyiq`: Docker service `footyiq-backend` is Live on Free at https://footyiq-backend-ydh7.onrender.com. `WEB_ORIGIN` matches the Vercel production domain. The service uses Neon's pooled TLS connection; credentials are stored only in provider settings.
- Render was connected through the public repository URL because its repository picker showed no authorized repositories despite GitHub sign-in. Backend deploys remain manual; Vercel is connected to the GitHub repository.

## Public verification (2026-09-25)

- Default central right-foot prediction: 26.3%; changing to Head: 7.0%.
- A 30-yard header correctly abstains and explains the supported 2.4–22.9-yard range.
- Saving, revisiting the original context, and reloading the collection passed in the public browser.
- Separate HTTP cookie sessions verified collection isolation, saving/reading, CSV export, and a Secure collection cookie. Health reported the database healthy.
- Direct Render API access without the proxy credential returned HTTP 403.
- Render recorded a successful service restart; the browser's previously saved shot remained afterward.
- The actual free service runs with a 512 MB limit. Render's free dashboard hides memory/CPU usage metrics, so no observed peak-memory claim is made. The earlier CI container check passed with a 512 MB memory constraint.
- Production backup/restore, dependency audits, attribution and the demo recording are complete. The controlled idle-to-awake check and hands-on screen-reader review remain open before the v1 tag. No paid plan or scheduled keep-alive workaround was enabled.

## Recovery and audit follow-up

The [September 25 CI run](https://github.com/safwanasif/FootyIQ/actions/runs/36203108328) passed a custom-format PostgreSQL backup and restore into a separate database. It compared complete shot rows (including context and collection ownership), migration versions and indexes, then verified the restored identity sequence. This uses disposable CI data, not a production Neon backup. The npm and Python advisory checks also passed; see [audit scope](dependency-audit.md).

To rehearse recovery of the actual Neon database, run the following in PowerShell with Docker Desktop running:

```powershell
.\scripts\backup-neon.ps1
```

At the hidden prompt, paste the production connection string from Neon's Connect dialog. The script uses PostgreSQL 18 tools, reads Neon with `pg_dump`, and restores the archive into a new local container. It never restores over Neon. It removes only its temporary restore container afterward and retains the backup under `%LOCALAPPDATA%\FootyIQ\backups`, outside the repository. Keep that directory private. A successful run prints restored shot counts and migration versions; record that result before checking off production recovery. The user ran this successfully on September 25: the isolated PostgreSQL 18 restore contained 2 saved shots and migration versions 1, 2, 3 and 4. The private archive remains outside Git; production was not overwritten. This is a manual recovery rehearsal, not a scheduled backup policy.

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

For an on-demand check, open GitHub Actions → **Public demo check** → **Run workflow**. It checks database readiness, a bounded prediction and the expected model ID without credentials or saved-shot writes. It allows one retry for startup. This is deliberately not scheduled and does not provide continuous uptime monitoring.

An open app tab checks health every ten seconds, so leaving it open is not an idle test. For a controlled cold-start check, close the public app in all browsers and leave it without requests for at least 20 minutes. Then open it once and record whether the wake-up/retry message appears, whether Retry prediction recovers, and whether Refresh collection restores the saved history. Correlate with Render's lifecycle/log timestamps before claiming an actual sleep-to-awake test; a quick successful response alone could have reached an already-warm instance. The September 25 on-demand check passed in 0.81 seconds on its first attempt and is recorded only as warm availability evidence.

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
