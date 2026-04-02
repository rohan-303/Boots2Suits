DO $$
BEGIN
  CREATE TYPE export_status AS ENUM ('pending', 'exported', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS job_candidate_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  export_status export_status NOT NULL DEFAULT 'pending',
  export_target text NOT NULL DEFAULT 'manual_handoff',
  export_format text NOT NULL DEFAULT 'json',
  request_fingerprint text,
  external_source text,
  external_id text,
  exported_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  candidate_count integer NOT NULL DEFAULT 0,
  payload jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  exported_at timestamptz
);

CREATE TABLE IF NOT EXISTS job_candidate_export_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_id uuid NOT NULL REFERENCES job_candidate_exports(id) ON DELETE CASCADE,
  veteran_profile_id uuid NOT NULL REFERENCES veteran_profiles(id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  match_run_id uuid,
  match_score numeric(7, 6),
  rank integer,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_candidate_export_items_unique UNIQUE (export_id, veteran_profile_id),
  CONSTRAINT job_candidate_export_items_rank_positive CHECK (rank IS NULL OR rank > 0),
  CONSTRAINT job_candidate_export_items_match_score_bounds CHECK (
    match_score IS NULL OR (match_score >= 0 AND match_score <= 1)
  )
);

CREATE INDEX IF NOT EXISTS idx_job_candidate_exports_job_id
  ON job_candidate_exports (job_id);

CREATE INDEX IF NOT EXISTS idx_job_candidate_exports_status
  ON job_candidate_exports (export_status);

CREATE INDEX IF NOT EXISTS idx_job_candidate_exports_exported_by_user_id
  ON job_candidate_exports (exported_by_user_id);

CREATE INDEX IF NOT EXISTS idx_job_candidate_exports_request_fingerprint
  ON job_candidate_exports (request_fingerprint);

CREATE INDEX IF NOT EXISTS idx_job_candidate_export_items_export_id
  ON job_candidate_export_items (export_id);

CREATE INDEX IF NOT EXISTS idx_job_candidate_export_items_veteran_profile_id
  ON job_candidate_export_items (veteran_profile_id);

CREATE INDEX IF NOT EXISTS idx_job_candidate_export_items_application_id
  ON job_candidate_export_items (application_id);

CREATE INDEX IF NOT EXISTS idx_job_candidate_export_items_match_run_id
  ON job_candidate_export_items (match_run_id);
