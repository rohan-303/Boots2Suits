# Boots2Suits Database Schema Foundation

## Scope

This document defines the foundational PostgreSQL schema for Boots2Suits and the
Drizzle migration workflow used to evolve it.

Included entities:

- `users`
- `companies`
- `veteran_profiles`
- `veteran_personas`
- `jobs`
- `job_personas`
- `applications`
- `candidate_job_scores`

## Stack

- Database: PostgreSQL
- Vector search: `pgvector` extension
- ORM and schema: Drizzle (`drizzle-orm`)
- Migration tooling: Drizzle Kit (`drizzle-kit`)

## Design Principles

- Keep identity (`users`) separate from role-specific profile data.
- Support explainable matching with dedicated score records and explanation payloads.
- Keep persona layers explicit for both candidates and jobs (`*_personas`).
- Use enums for controlled state and categorical dimensions.
- Add practical indexes for expected filters and ranking queries.

## Table Overview

### `users`

Platform identities across veteran and employer flows.

Key columns:

- `id` (uuid, PK)
- `email` (unique, required)
- `role` (`user_role`)
- `status` (`user_status`)

### `companies`

Employer organizations.

Key columns:

- `id` (uuid, PK)
- `owner_user_id` (FK -> `users.id`, nullable, `ON DELETE SET NULL`)
- `name` (required)
- `size` (`company_size`)

### `veteran_profiles`

Veteran-focused profile data and normalized military context.

Key columns:

- `id` (uuid, PK)
- `user_id` (FK -> `users.id`, unique, `ON DELETE CASCADE`)
- `military_branch` (`military_branch`)
- `resume_text`
- `civilian_summary`
- `embedding` (`vector(1536)`)

### `veteran_personas`

Structured profile personas for different matching perspectives.

Key columns:

- `id` (uuid, PK)
- `veteran_profile_id` (FK -> `veteran_profiles.id`, `ON DELETE CASCADE`)
- `scope` (`persona_scope`)
- `summary`
- `strengths` / `gaps` (`jsonb`)
- `embedding` (`vector(1536)`)

Uniqueness:

- one persona per profile per scope (`veteran_profile_id`, `scope`)

### `jobs`

Employer job postings.

Key columns:

- `id` (uuid, PK)
- `company_id` (FK -> `companies.id`, `ON DELETE CASCADE`)
- `posted_by_user_id` (FK -> `users.id`, nullable, `ON DELETE SET NULL`)
- `title`
- `employment_type` (`employment_type`)
- `location_type` (`location_type`)
- `status` (`job_status`)
- `description`
- `embedding` (`vector(1536)`)

### `job_personas`

Structured job personas for matching dimensions.

Key columns:

- `id` (uuid, PK)
- `job_id` (FK -> `jobs.id`, `ON DELETE CASCADE`)
- `scope` (`persona_scope`)
- `summary`
- `required_traits` / `preferred_traits` (`jsonb`)
- `embedding` (`vector(1536)`)

Uniqueness:

- one persona per job per scope (`job_id`, `scope`)

### `applications`

Veteran applications to jobs.

Key columns:

- `id` (uuid, PK)
- `veteran_profile_id` (FK -> `veteran_profiles.id`, `ON DELETE CASCADE`)
- `job_id` (FK -> `jobs.id`, `ON DELETE CASCADE`)
- `status` (`application_status`)
- `applied_at`

Uniqueness:

- one direct application record per candidate/job pair

### `candidate_job_scores`

Explainable matching output between a veteran profile and a job.

Key columns:

- `id` (uuid, PK)
- `veteran_profile_id` (FK -> `veteran_profiles.id`, `ON DELETE CASCADE`)
- `job_id` (FK -> `jobs.id`, `ON DELETE CASCADE`)
- `algorithm_version`
- `score`, `semantic_score`, `rule_score`
- `explanation` (required text)
- `explanation_data` (`jsonb`)
- `rank`

Uniqueness:

- one score record per candidate/job/algorithm version

## Enums

- `user_role`: `veteran`, `employer`, `admin`
- `user_status`: `active`, `inactive`
- `company_size`: `startup`, `small`, `mid_market`, `enterprise`
- `military_branch`: `army`, `navy`, `air_force`, `marines`, `space_force`, `coast_guard`, `national_guard`, `other`
- `persona_scope`: `overall`, `leadership`, `technical`, `culture`
- `employment_type`: `full_time`, `part_time`, `contract`, `internship`
- `location_type`: `onsite`, `hybrid`, `remote`
- `job_status`: `draft`, `published`, `closed`
- `application_status`: `applied`, `screening`, `interview`, `offer`, `hired`, `rejected`, `withdrawn`

## Indexing Strategy

- Filters:
  - role/status indexes on users, status/location indexes on jobs/applications
  - owner/company/job foreign key indexes
- Ranking:
  - descending score indexes on `candidate_job_scores`
- Vector search:
  - ivfflat indexes using cosine ops on profile/persona/job embeddings

## Migrations

Source files:

- Drizzle schema: `packages/db/src/schema.ts`
- Migration SQL: `packages/db/drizzle/0000_boots2suits_foundation.sql`
- Migration journal: `packages/db/drizzle/meta/_journal.json`

Run from repository root:

```bash
npm run db:generate
npm run db:migrate
```

