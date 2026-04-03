# Boots2Suits Async Reliability Hardening

## Scope

This foundation hardens async processing for:

- resume parsing
- matching runs
- embedding generation
- connector exports

## Idempotency Model

- enqueue uses deterministic idempotency keys per work unit:
  - resume parse: `resume:<documentId>`
  - matching run: `matchrun:<matchRunId>`
- embedding: `embedding:<targetType>:<targetId>:<sourceSnapshotHash>`
- connector export: `connector-export:<exportId>`
- if a job with the same key is already `waiting|active|delayed|prioritized|waiting-children`,
  enqueue is deduped and reuses the existing queued work.
- replay uses forced enqueue with suffix (for example `:replay-<timestamp>`) to create a fresh execution attempt.

## Retry Policy

Global defaults:

- `QUEUE_JOB_ATTEMPTS`
- `QUEUE_JOB_BACKOFF_MS`

Per-job overrides:

- `QUEUE_RESUME_JOB_ATTEMPTS`, `QUEUE_RESUME_JOB_BACKOFF_MS`
- `QUEUE_MATCHING_JOB_ATTEMPTS`, `QUEUE_MATCHING_JOB_BACKOFF_MS`
- `QUEUE_EMBEDDING_JOB_ATTEMPTS`, `QUEUE_EMBEDDING_JOB_BACKOFF_MS`
- `QUEUE_CONNECTOR_JOB_ATTEMPTS`, `QUEUE_CONNECTOR_JOB_BACKOFF_MS`

Retries use exponential backoff.

## Retryable vs Non-Retryable Failures

- Non-retryable:
  - `VALIDATION_ERROR` (for example malformed payload/state mismatch)
  - worker throws `UnrecoverableError` so BullMQ stops retrying immediately
- Retryable:
  - `SYSTEM_ERROR`
  - `EXTERNAL_DEPENDENCY_ERROR`

Classification uses shared observability helpers.

## Status Transition Hardening

Resume parse and matching runs now preserve cumulative attempt counters across retries/replays.

Embedding lifecycle now persists:

- `embedding_attempts`
- `embedding_retry_count`
- `embedding_last_retried_at`
- `embedding_error_type`
- `embedding_duration_ms`
- `embedding_completed_at`

## Dead-Letter / Terminal Failure Handling

Terminal failures are persisted into:

- `async_job_dead_letters`

Each row stores:

- queue/job identity
- payload snapshot
- error type/message/stack
- attempts made vs max attempts
- replay metadata (`replay_count`, `last_replay_at`, `last_replay_by_user_id`, `last_replay_job_id`)

## Replay Flow

Admin-only API:

- `POST /ops/async/failed-jobs/:deadLetterId/replay`

Replay behavior:

1. validate dead-letter payload
2. reset source status to `pending` (resume/matching/embedding)
3. enqueue a fresh forced attempt with replay suffix
4. increment replay metadata on dead-letter row

Replay guardrail:

- `QUEUE_REPLAY_MAX_PER_JOB` limits replay loops.

## Inspection / Debugging

Admin APIs:

- `GET /ops/async/queues`
- `GET /ops/async/failed-jobs`

CLI:

- `npm run queue:inspect`
  - includes queue counts/recent failed jobs
  - includes unresolved dead-letter rows
