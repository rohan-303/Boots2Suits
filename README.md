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
EMBEDDINGS_ENABLED=false
EMBEDDINGS_PROVIDER=none
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDINGS_MODEL=text-embedding-3-small
EMBEDDINGS_BASE_URL=https://api.openai.com/v1
EMBEDDINGS_API_KEY=
MATCH_SEMANTIC_WEIGHT=0.6
MATCH_RULE_WEIGHT=0.4
MATCH_EMBEDDING_BLEND_WEIGHT=0.8
MATCH_STRUCTURED_BLEND_WEIGHT=0.2
QUEUE_JOB_ATTEMPTS=3
QUEUE_JOB_BACKOFF_MS=2000
QUEUE_RESUME_JOB_ATTEMPTS=3
QUEUE_RESUME_JOB_BACKOFF_MS=2000
QUEUE_MATCHING_JOB_ATTEMPTS=3
QUEUE_MATCHING_JOB_BACKOFF_MS=2500
QUEUE_EMBEDDING_JOB_ATTEMPTS=2
QUEUE_EMBEDDING_JOB_BACKOFF_MS=1500
QUEUE_REPLAY_MAX_PER_JOB=3
```

Worker:

```bash
npm run dev:worker
```

Worker requires `apps/worker/.env` with:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/boots2suits
REDIS_URL=redis://localhost:6379
WORKER_CONCURRENCY=2
EMBEDDINGS_ENABLED=false
EMBEDDINGS_PROVIDER=none
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDINGS_MODEL=text-embedding-3-small
EMBEDDINGS_BASE_URL=https://api.openai.com/v1
EMBEDDINGS_API_KEY=
MATCH_SEMANTIC_WEIGHT=0.6
MATCH_RULE_WEIGHT=0.4
MATCH_EMBEDDING_BLEND_WEIGHT=0.8
MATCH_STRUCTURED_BLEND_WEIGHT=0.2
```

## Quality checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Run all CI checks locally:

```bash
npm run ci:check
```

Inspect queue health and failed jobs:

```bash
npm run queue:inspect
```

Pretty-print structured JSON logs from any service:

```bash
npm run logs:dev
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
- `POST /veteran/resume/upload` (PDF upload + async parse queue)
- `POST /veteran/resume/:documentId/parse` (requeue parse for active resume)

## Employer onboarding + jobs routes (foundation)

- `GET /employer/profile`
- `POST /employer/profile`
- `GET /employer/jobs`
- `POST /employer/jobs`
- `GET /employer/jobs/:jobId`
- `POST /employer/jobs/:jobId/persona/generate`

Employer shortlist workflow routes:

- `POST /employer/jobs/:jobId/candidates/:veteranProfileId/review`
- `POST /employer/jobs/:jobId/candidates/:veteranProfileId/shortlist`
- `POST /employer/jobs/:jobId/candidates/:veteranProfileId/reject`
- `POST /employer/jobs/:jobId/candidates/:veteranProfileId/reset`
- `GET /employer/jobs/:jobId/candidates/:veteranProfileId`

ATS export / recruiter handoff routes:

- `POST /employer/jobs/:jobId/export`
- `GET /employer/jobs/:jobId/exports`
- `GET /employer/jobs/:jobId/exports/:exportId`
- `GET /employer/exports/targets`
- `GET /employer/connectors`
- `PUT /employer/connectors/:connectorType`
- `POST /employer/connectors/:connectorType/test`

Export targets currently supported:

- `manual_handoff`
- `greenhouse_stub` (deterministic simulation stub)
- `greenhouse` (prepared connector mode, simulated execution)
- `lever` (prepared connector mode, simulated execution)
- `workday` (prepared connector mode, simulated execution)

Async reliability / ops routes (admin only):

- `GET /ops/async/queues`
- `GET /ops/async/failed-jobs?limit=25&queue=resume-parsing|matching-runs|embedding-generation`
- `POST /ops/async/failed-jobs/:deadLetterId/replay`

## Matching MVP routes

- `POST /matching/jobs/:jobId/run`
- `GET /matching/jobs/:jobId/results`
- `GET /matching/veterans/:veteranProfileId/jobs`

## Application routes

- `POST /applications`
- `GET /applications/me`

## Matching evaluation & calibration

Run evaluation:

```bash
npm run match:evaluate --workspace @boots2suits/api
```

Embedding-mode simulation (for deterministic comparison in eval):

```bash
npm run match:evaluate --workspace @boots2suits/api -- --embedding-mode real_embeddings --embedding-model-version eval-embedding-sim-v1
```

Compare structured-only vs hybrid embedding mode:

```bash
npm run match:evaluate:compare --workspace @boots2suits/api
```

Run baseline vs candidate calibration:

```bash
npm run match:calibrate --workspace @boots2suits/api -- --candidate src/matching/configs/candidate-emphasis-skill-persona.json
```

Run quality gate (CI-enforced):

```bash
npm run match:quality-gate --workspace @boots2suits/api
```

## Baseline and thresholds

Quality-gate baseline config:

- `apps/api/src/matching/eval/baseline/starter-baseline.json`

To update baseline safely:

1. Run `npm run match:evaluate --workspace @boots2suits/api`
2. Validate metric changes and explanation quality manually.
3. Update `lockedMetrics` and/or thresholds in `starter-baseline.json` in the same PR.
4. Include rationale in PR notes for why baseline changes are intentional.

Inspect persisted pair/ranking outputs:

```bash
npm run match:inspect --workspace @boots2suits/api -- pair --jobId <job-id> --veteranProfileId <veteran-profile-id>
npm run match:inspect --workspace @boots2suits/api -- job --jobId <job-id>
npm run match:inspect --workspace @boots2suits/api -- veteran --veteranProfileId <veteran-profile-id>
```

## Military lookup routes

- `GET /military/occupations/search?q=...&branch=...`

## Notes

- This phase intentionally avoids product features and business logic.
- API startup validates `DATABASE_URL`, checks DB connectivity before listening,
  and exposes `/health` with live database status.
- Worker processes async resume parsing and async matching runs via Redis/BullMQ.
- Worker also processes async persona embedding generation.
- If embeddings are disabled/missing/failed, matching falls back safely to rule-based scoring only.
- API and worker now emit structured JSON logs with route/action, status, user/job IDs, and latency.
- Resume parsing and matching runs persist lifecycle metadata (queued/started/completed/failed/retry, attempts, duration, and error metadata).
- Queue retries use exponential backoff via `QUEUE_JOB_ATTEMPTS` and `QUEUE_JOB_BACKOFF_MS`.
- Retry policy can be tuned per job type via:
  - `QUEUE_RESUME_JOB_ATTEMPTS`, `QUEUE_RESUME_JOB_BACKOFF_MS`
  - `QUEUE_MATCHING_JOB_ATTEMPTS`, `QUEUE_MATCHING_JOB_BACKOFF_MS`
  - `QUEUE_EMBEDDING_JOB_ATTEMPTS`, `QUEUE_EMBEDDING_JOB_BACKOFF_MS`
  - `QUEUE_CONNECTOR_JOB_ATTEMPTS`, `QUEUE_CONNECTOR_JOB_BACKOFF_MS`
- Terminal queue failures are persisted to `async_job_dead_letters` for replay/audit.
- Connector exports now run with explicit status lifecycle:
  - `queued`
  - `processing`
  - `exported`
  - `failed`

## Debugging failed async jobs

1. Run `npm run queue:inspect` to see waiting/active/failed counts and recent failed jobs.
2. Check structured worker logs for the failed `jobId` and `errorType`.
3. Inspect database lifecycle columns:
   - `veteran_documents.parse_status`, `parse_attempts`, `parse_retry_count`, `parse_error_type`, `parse_error`
   - `match_runs.status`, `attempts`, `retry_count`, `error_type`, `error_message`
4. Re-trigger parsing from `POST /veteran/resume/:documentId/parse` or matching from `POST /matching/jobs/:jobId/run`.
5. Inspect dead-letter entries with `GET /ops/async/failed-jobs` (admin) or `npm run queue:inspect`.
6. Replay a failed job safely via `POST /ops/async/failed-jobs/:deadLetterId/replay` (admin).
