# Boots2Suits Database Schema

## MVP Foundation Goals

This schema supports the MVP-critical data model for:

1. military-to-civilian translation
2. Overall Veteran Persona
3. Employer Job Persona
4. hybrid semantic matching with explainable ranking

## Core Tables

- `users`
  - platform identity
  - includes ATS sync fields: `external_id`, `external_source`, `sync_status`, `last_synced_at`
- `user_auth_credentials`
  - password hash records for login authentication
- `auth_sessions`
  - revocable session store for httpOnly cookie auth
- `companies`
  - employer organization
  - includes ATS sync fields
  - onboarding foundation fields: hiring roles/volume, veteran hiring priority,
    clearance-sensitive flag, hiring regions, recruiter context, contact preferences,
    and `profile_completed_at`
- `military_occupations`
  - structured MOS/occupation reference by branch
- `veteran_profiles`
  - veteran profile + translation context
  - includes: `mos_code`, `mos_title`, `highest_rank`, `clearance_level`,
    `service_start_date`, `service_end_date`, `discharge_type`,
    `translation_confidence`, `translation_version`
  - onboarding foundation fields: work authorization, relocation preference,
    responsibilities summary, guided skills/tools/intent arrays, salary expectation,
    and completion timestamp
- `veteran_occupation_history`
  - normalized profile-level MOS history (minimal practical MVP form)
- `veteran_documents`
  - uploaded veteran document metadata (MVP: resume PDF)
  - parse lifecycle fields (`parse_status`, `parse_confidence`, `parse_error`)
  - stores deterministic parsed section output in `parsed_data`
- `veteran_personas`
  - profile personas by scope (`overall`, `leadership`, `technical`, `culture`)
  - overall persona supports structured outputs: strengths, role clusters,
    experience level, leadership/technical profiles, suggested job titles,
    model version, embedding model version, source snapshot hash, and embedding timestamp
  - embedding async lifecycle: `embedding_status`, `embedding_error`,
    `embedding_queued_at`, `embedding_started_at`, `embedding_completed_at`, `embedding_failed_at`,
    `embedding_attempts`, `embedding_retry_count`, `embedding_last_retried_at`,
    `embedding_error_type`, `embedding_duration_ms`
- `jobs`
  - job posting + ATS sync fields
  - structured posting fields for persona-ready modeling:
    `department`, `must_have_skills`, `nice_to_have_skills`,
    `required_experience_level`, `clearance_requirement`, `travel_requirement`
- `job_personas`
  - job personas by scope
  - deterministic employer-facing persona output fields:
    `leadership_level`, `execution_vs_strategy`, `environment_type`,
    `technical_depth`, `suggested_candidate_archetypes`, `priority_signals`,
    `disqualifiers`, `suggested_role_family`, `model_version`,
    `embedding_model_version`, `source_snapshot_hash`
  - embedding async lifecycle: `embedding_status`, `embedding_error`,
    `embedding_queued_at`, `embedding_started_at`, `embedding_completed_at`, `embedding_failed_at`,
    `embedding_attempts`, `embedding_retry_count`, `embedding_last_retried_at`,
    `embedding_error_type`, `embedding_duration_ms`
- `applications`
  - current application state (no longer hard-unique by profile/job)
  - includes ATS sync fields
- `application_events`
  - append-only lifecycle/event history for applications
- `job_candidate_exports`
  - recruiter handoff/export batch records by job
  - tracks export status/target/format/fingerprint/exported_by/candidate_count/payload
  - connector metadata: `connector_type`, `connector_request_payload`, `connector_response_summary`,
    `external_source`, `external_id`, `error_type`, `error_message`
  - connector lifecycle metadata: `connector_queued_at`, `connector_started_at`,
    `connector_completed_at`, `connector_failed_at`, `connector_attempts`,
    `connector_retry_count`, `connector_last_retried_at`, `connector_duration_ms`
- `job_candidate_export_items`
  - candidate-level records inside each export batch
  - stores per-candidate handoff packet payload + match/application references
- `match_runs`
  - scoring run provenance for replay/audit
- `candidate_job_scores`
  - hybrid score output with run-level and row-level provenance
- `candidate_job_score_features`
  - feature-level explanation/contribution rows per score
- `async_job_dead_letters`
  - terminal failure records for async jobs across queues
  - stores queue/job IDs, payload snapshot, error metadata, attempts, and replay metadata

## Enums

- `user_role`: `veteran`, `employer`, `admin`
- `user_status`: `active`, `inactive`
- `sync_status`: `pending`, `synced`, `failed`, `stale`
- `company_size`: `startup`, `small`, `mid_market`, `enterprise`
- `military_branch`: `army`, `navy`, `air_force`, `marines`, `space_force`, `coast_guard`, `national_guard`, `other`
- `clearance_level`: `none`, `confidential`, `secret`, `top_secret`, `ts_sci`, `other`
- `discharge_type`: `honorable`, `general`, `other_than_honorable`, `bad_conduct`, `dishonorable`, `medical`, `unknown`
- `persona_scope`: `overall`, `leadership`, `technical`, `culture`
- `employment_type`: `full_time`, `part_time`, `contract`, `internship`
- `location_type`: `onsite`, `hybrid`, `remote`
- `job_status`: `draft`, `published`, `closed`
- `application_status`: `applied`, `screening`, `interview`, `offer`, `hired`, `rejected`, `withdrawn`
  - workflow foundation also supports: `drafted`, `reviewed`, `shortlisted`, `closed`
- `application_event_type`: `created`, `status_changed`, `note`, `sync`
- `resume_parse_status`: `pending`, `processing`, `completed`, `failed`
- `embedding_status`: `pending`, `processing`, `completed`, `failed`
- `match_run_status`: `queued`, `running`, `completed`, `failed`
- `export_status`: `queued`, `processing`, `exported`, `failed`
- `async_dead_letter_status`: `failed`, `replayed`, `resolved`
- `ats_connector_type`: `manual_handoff`, `greenhouse_stub`, `greenhouse`, `lever`, `workday`
- `ats_connector_environment`: `sandbox`, `production`
- `ats_connector_auth_mode`: `none`, `api_key_reference`, `oauth_placeholder`
- `ats_connector_test_status`: `not_tested`, `passed`, `failed`

## Provenance and Explainability

`candidate_job_scores` now carries deterministic replay metadata:

- `match_run_id`
- `embedding_model_version`
- `reranker_version`
- `calibration_version`
- `score_version`
- `explanation_version`
- `input_fingerprint`
- `source_snapshot_hash`

`candidate_job_score_features` provides feature-level explanation rows:

- `feature_name`
- `feature_weight`
- `feature_value`
- `feature_impact`
- `reason_code`

## Integrity Checks

The schema enforces low-risk/high-value checks:

- `veteran_profiles.years_of_service >= 0`
- valid veteran service date ordering
- `translation_confidence` bounded in `[0, 1]`
- valid compensation range (`compensation_min <= compensation_max`)
- score bounds in `[0, 1]` for score channels
- positive rank
- bounded feature weights/impacts

## Index Strategy

- standard FK and filter indexes for profile/job/application paths
- descending rank/query indexes for score retrieval by job/profile
- pgvector ivfflat indexes with `vector_cosine_ops` for:
  - `veteran_profiles.embedding`
  - `veteran_personas.embedding`
  - `jobs.embedding`
  - `job_personas.embedding`
- vector indexes are partial (`WHERE embedding IS NOT NULL`) to reduce bloat

## Migration Files

- `packages/db/drizzle/0000_boots2suits_foundation.sql`
- `packages/db/drizzle/0001_mvp_schema_hardening.sql`
- `packages/db/drizzle/0002_auth_foundation.sql`
- `packages/db/drizzle/0003_veteran_onboarding_persona_foundation.sql`
- `packages/db/drizzle/0004_employer_onboarding_job_persona_foundation.sql`
- `packages/db/drizzle/0005_resume_ingestion_foundation.sql`
- `packages/db/drizzle/0006_application_workflow_statuses.sql`
- `packages/db/drizzle/0007_async_processing_foundation.sql`
- `packages/db/drizzle/0008_embeddings_foundation.sql`
- `packages/db/drizzle/0009_observability_async_lifecycle.sql`
- `packages/db/drizzle/0010_embeddings_status_and_hybrid_foundation.sql`
- `packages/db/drizzle/0011_ats_export_foundation.sql`
- `packages/db/drizzle/0012_async_reliability_hardening.sql`
- `packages/db/drizzle/0013_ats_connector_adapter_foundation.sql`
- `packages/db/drizzle/0014_ats_connector_preparation_layer.sql`
- `packages/db/drizzle/meta/_journal.json`

## Commands

From repository root:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

Seed script location:

- `packages/db/src/seed.ts`
- `company_ats_connectors`
  - per-company ATS connector configuration and readiness metadata
  - stores connector type, enabled/environment/auth placeholders, credential reference state,
    mapping metadata, and last-test result fields
