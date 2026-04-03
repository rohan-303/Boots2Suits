DO $$
BEGIN
  CREATE TYPE ats_connector_type AS ENUM (
    'manual_handoff',
    'greenhouse_stub',
    'greenhouse',
    'lever',
    'workday'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE ats_connector_environment AS ENUM ('sandbox', 'production');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE ats_connector_auth_mode AS ENUM ('none', 'api_key_reference', 'oauth_placeholder');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE ats_connector_test_status AS ENUM ('not_tested', 'passed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TYPE export_status ADD VALUE IF NOT EXISTS 'queued';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TYPE export_status ADD VALUE IF NOT EXISTS 'processing';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS company_ats_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connector_type ats_connector_type NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  environment ats_connector_environment NOT NULL DEFAULT 'sandbox',
  base_url text,
  auth_mode ats_connector_auth_mode NOT NULL DEFAULT 'api_key_reference',
  credential_configured boolean NOT NULL DEFAULT false,
  credential_reference text,
  config_metadata jsonb,
  field_mappings jsonb,
  last_tested_at timestamptz,
  last_test_status ats_connector_test_status NOT NULL DEFAULT 'not_tested',
  last_test_message text,
  last_test_response jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_ats_connectors_company_type_unique UNIQUE (company_id, connector_type)
);

CREATE INDEX IF NOT EXISTS idx_company_ats_connectors_company_id
  ON company_ats_connectors (company_id);
CREATE INDEX IF NOT EXISTS idx_company_ats_connectors_connector_type
  ON company_ats_connectors (connector_type);
CREATE INDEX IF NOT EXISTS idx_company_ats_connectors_enabled
  ON company_ats_connectors (enabled);

ALTER TABLE job_candidate_exports
  ADD COLUMN IF NOT EXISTS company_connector_id uuid REFERENCES company_ats_connectors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS connector_queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS connector_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS connector_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS connector_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS connector_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS connector_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS connector_last_retried_at timestamptz,
  ADD COLUMN IF NOT EXISTS connector_duration_ms integer;

DO $$
BEGIN
  ALTER TABLE job_candidate_exports
    ADD CONSTRAINT job_candidate_exports_connector_duration_nonnegative
      CHECK (connector_duration_ms IS NULL OR connector_duration_ms >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE job_candidate_exports
    ADD CONSTRAINT job_candidate_exports_connector_attempts_nonnegative
      CHECK (connector_attempts >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE job_candidate_exports
    ADD CONSTRAINT job_candidate_exports_connector_retry_count_nonnegative
      CHECK (connector_retry_count >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE INDEX IF NOT EXISTS idx_job_candidate_exports_company_connector_id
  ON job_candidate_exports (company_connector_id);
