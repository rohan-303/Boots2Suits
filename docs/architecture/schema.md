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
- `veteran_personas`
  - profile personas by scope (`overall`, `leadership`, `technical`, `culture`)
  - overall persona supports structured outputs: strengths, role clusters,
    experience level, leadership/technical profiles, suggested job titles,
    model version, and source snapshot hash
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
    `disqualifiers`, `suggested_role_family`, `model_version`, `source_snapshot_hash`
- `applications`
  - current application state (no longer hard-unique by profile/job)
  - includes ATS sync fields
- `application_events`
  - append-only lifecycle/event history for applications
- `match_runs`
  - scoring run provenance for replay/audit
- `candidate_job_scores`
  - hybrid score output with run-level and row-level provenance
- `candidate_job_score_features`
  - feature-level explanation/contribution rows per score

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
- `application_event_type`: `created`, `status_changed`, `note`, `sync`

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
