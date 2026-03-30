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

## Notes

- This phase intentionally avoids product features and business logic.
- API currently exposes a simple `/health` endpoint for startup validation.
- Worker currently validates Redis connectivity and queue readiness only.

