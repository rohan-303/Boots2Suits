# Boots2Suits ATS Connector Adapter Foundation

## Goal

Provide a clean connector adapter layer for employer export handoff workflows so
new ATS connectors can be added without rewriting export route logic.

## Adapter Contract

Each connector implements:

- `prepareRequest`
  - builds connector-specific request payload from normalized export package
- `sendExport`
  - executes connector send flow and returns normalized connector result
- `normalizeError`
  - maps connector/runtime failures to normalized retryable/non-retryable errors

## Implemented Connectors

- `manual_handoff`
  - internal recruiter packet export
  - no third-party transport
- `greenhouse_stub`
  - deterministic external connector stub
  - simulated response shape with fake external IDs
  - supports deterministic simulation modes:
    - `success`
    - `retryable_failure`
    - `non_retryable_failure`
- preparation-mode connectors (simulated execution with config validation):
  - `greenhouse`
  - `lever`
  - `workday`

## Connector Configuration Model

Per-company connector setup is stored in `company_ats_connectors` with:

- `connector_type`
- `enabled`
- `environment` (`sandbox` / `production`)
- `base_url`
- `auth_mode` (placeholder)
- `credential_configured`
- `credential_reference` (reference only, no raw secret storage)
- `config_metadata`
- `field_mappings`
- `last_tested_at`
- `last_test_status`
- `last_test_message`
- `last_test_response`

## Credential Handling (Current Stage)

- no live secret vault integration yet
- no plaintext third-party secrets in this layer
- only credential readiness/reference state is stored

## Export Flow Integration

`POST /employer/jobs/:jobId/export` now:

1. builds normalized recruiter handoff package
2. routes through connector adapter by `exportTarget`
3. validates connector contract/readiness (for configured connectors)
4. persists connector request payload snapshot
5. queues connector execution for async processing (except manual handoff)
6. worker executes adapter and updates status/response metadata

## Persistence Fields

`job_candidate_exports` now stores connector-level metadata:

- `connector_type`
- `connector_request_payload`
- `connector_response_summary`
- `external_source`
- `external_id`
- `error_type`
- `error_message`
- `connector_queued_at`
- `connector_started_at`
- `connector_completed_at`
- `connector_failed_at`
- `connector_attempts`
- `connector_retry_count`
- `connector_last_retried_at`
- `connector_duration_ms`

## Async Execution

Connector export jobs run on queue:

- `connector-exports`

Lifecycle:

- `queued` -> `processing` -> `exported`
- `queued` -> `processing` -> `failed`

## Readiness Test Endpoint

- `POST /employer/connectors/:connectorType/test`

This performs connector readiness/contract validation with optional simulation mode,
without making live external ATS calls.

## Adding a New Connector Later

1. implement adapter in `packages/shared/src/ats.ts`
2. add target key to adapter registry
3. expose target in UI selector if needed
4. add/extend connector-specific config validation
5. optionally add target-specific tests

No route redesign required when adding connector adapters.
