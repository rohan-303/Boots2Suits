# Boots2Suits

Phase 0 foundation for an AI-powered veteran employment platform.

## What this includes

- Monorepo workspace layout (`apps/*` and `packages/*`)
- Clear service boundaries for:
  - frontend (`apps/web`)
  - backend API (`apps/api`)
  - worker (`apps/worker`)
- Shared TypeScript config (`packages/config`)
- Shared package placeholder (`packages/shared`)
- Environment variable examples at root and per app
- Common scripts for dev, build, and lint workflows

## Repository structure

```text
apps/
  web/
  api/
  worker/
packages/
  config/
  shared/
```

## Prerequisites

- Node.js 20+
- npm 9+
- Redis (for worker startup)

## Setup

```bash
npm install
```

Copy environment variables:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item apps/web/.env.example apps/web/.env
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/worker/.env.example apps/worker/.env
```

## Run services

Web:

```bash
npm run dev:web
```

API:

```bash
npm run dev:api
```

API requires `apps/api/.env` with:

```bash
API_PORT=4000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/boots2suits
CORS_ORIGIN=http://localhost:5173
AUTH_COOKIE_NAME=boots2suits_session
AUTH_COOKIE_SECURE=false
AUTH_SESSION_TTL_DAYS=7
AUTH_TOKEN_PEPPER=change-me-to-a-long-random-secret
```

Worker:

```bash
npm run dev:worker
```

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
```

## Database seed (development)

After migrations, seed realistic Boots2Suits development data:

```bash
npm run db:seed
```

The seed script is safe to rerun for local development. It uses fixed IDs and
`ON CONFLICT DO NOTHING` behavior to avoid duplicate inserts.

## Auth routes (foundation)

- `POST /auth/signup` (veteran/employer roles only)
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

Role-protection skeleton test routes:

- `GET /auth/role-test/veteran` (veteran/admin)
- `GET /auth/role-test/employer` (employer/admin)
- `GET /auth/role-test/admin` (admin only)

## Veteran onboarding routes (foundation)

- `GET /veteran/profile`
- `POST /veteran/profile`
- `POST /veteran/persona/generate`
- `POST /veteran/resume/upload` (PDF upload + parse + safe enrichment)

## Employer onboarding + jobs routes (foundation)

- `GET /employer/profile`
- `POST /employer/profile`
- `GET /employer/jobs`
- `POST /employer/jobs`
- `GET /employer/jobs/:jobId`
- `POST /employer/jobs/:jobId/persona/generate`

## Matching MVP routes

- `POST /matching/jobs/:jobId/run`
- `GET /matching/jobs/:jobId/results`
- `GET /matching/veterans/:veteranProfileId/jobs`

## Military lookup routes

- `GET /military/occupations/search?q=...&branch=...`

## Notes

- This phase intentionally avoids product features and business logic.
- API startup validates `DATABASE_URL`, checks DB connectivity before listening,
  and exposes `/health` with live database status.
- Worker currently validates Redis connectivity and queue readiness only.
