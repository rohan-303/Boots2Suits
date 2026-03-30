DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sync_status') THEN
    CREATE TYPE sync_status AS ENUM ('pending', 'synced', 'failed', 'stale');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clearance_level') THEN
    CREATE TYPE clearance_level AS ENUM (
      'none',
      'confidential',
      'secret',
      'top_secret',
      'ts_sci',
      'other'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'discharge_type') THEN
    CREATE TYPE discharge_type AS ENUM (
      'honorable',
      'general',
      'other_than_honorable',
      'bad_conduct',
      'dishonorable',
      'medical',
      'unknown'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'application_event_type') THEN
    CREATE TYPE application_event_type AS ENUM ('created', 'status_changed', 'note', 'sync');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS military_occupations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  military_branch military_branch NOT NULL,
  mos_code text NOT NULL,
  mos_title text NOT NULL,
  civilian_equivalent_title text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT military_occupations_branch_code_unique UNIQUE (military_branch, mos_code)
);

CREATE TABLE IF NOT EXISTS veteran_occupation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veteran_profile_id uuid NOT NULL REFERENCES veteran_profiles(id) ON DELETE CASCADE,
  military_occupation_id uuid REFERENCES military_occupations(id) ON DELETE SET NULL,
  mos_code text NOT NULL,
  mos_title text NOT NULL,
  start_date date,
  end_date date,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT veteran_occupation_history_dates_valid
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  event_type application_event_type NOT NULL,
  from_status application_status,
  to_status application_status,
  reason_code text,
  note text,
  payload jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  algorithm_version text NOT NULL DEFAULT 'v1',
  embedding_model_version text NOT NULL DEFAULT 'unknown',
  reranker_version text,
  calibration_version text,
  score_version text NOT NULL DEFAULT 'v1',
  explanation_version text NOT NULL DEFAULT 'v1',
  input_fingerprint text,
  source_snapshot_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS candidate_job_score_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_job_score_id uuid NOT NULL REFERENCES candidate_job_scores(id) ON DELETE CASCADE,
  feature_name text NOT NULL,
  feature_weight numeric(8, 6),
  feature_value text,
  feature_impact numeric(8, 6) NOT NULL,
  reason_code text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT candidate_job_score_features_weight_bounds
    CHECK (feature_weight IS NULL OR (feature_weight >= -1 AND feature_weight <= 1)),
  CONSTRAINT candidate_job_score_features_impact_bounds
    CHECK (feature_impact >= -1 AND feature_impact <= 1)
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS sync_status sync_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS sync_status sync_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS sync_status sync_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS sync_status sync_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

ALTER TABLE veteran_profiles
  ADD COLUMN IF NOT EXISTS mos_code text,
  ADD COLUMN IF NOT EXISTS mos_title text,
  ADD COLUMN IF NOT EXISTS highest_rank text,
  ADD COLUMN IF NOT EXISTS clearance_level clearance_level,
  ADD COLUMN IF NOT EXISTS service_start_date date,
  ADD COLUMN IF NOT EXISTS service_end_date date,
  ADD COLUMN IF NOT EXISTS discharge_type discharge_type,
  ADD COLUMN IF NOT EXISTS translation_confidence numeric(4, 3),
  ADD COLUMN IF NOT EXISTS translation_version text;

ALTER TABLE candidate_job_scores
  ADD COLUMN IF NOT EXISTS match_run_id uuid,
  ADD COLUMN IF NOT EXISTS embedding_model_version text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS reranker_version text,
  ADD COLUMN IF NOT EXISTS calibration_version text,
  ADD COLUMN IF NOT EXISTS score_version text NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS explanation_version text NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS input_fingerprint text,
  ADD COLUMN IF NOT EXISTS source_snapshot_hash text;

INSERT INTO match_runs (
  algorithm_version,
  embedding_model_version,
  reranker_version,
  calibration_version,
  score_version,
  explanation_version,
  input_fingerprint,
  source_snapshot_hash
)
SELECT
  'legacy',
  'legacy',
  NULL,
  NULL,
  'v0',
  'v0',
  'legacy-bootstrap',
  'legacy-bootstrap'
WHERE NOT EXISTS (
  SELECT 1
  FROM match_runs
  WHERE input_fingerprint = 'legacy-bootstrap'
);

UPDATE candidate_job_scores
SET match_run_id = (
  SELECT id
  FROM match_runs
  WHERE input_fingerprint = 'legacy-bootstrap'
  ORDER BY created_at
  LIMIT 1
)
WHERE match_run_id IS NULL;

ALTER TABLE candidate_job_scores
  ALTER COLUMN match_run_id SET NOT NULL;

ALTER TABLE candidate_job_scores
  ADD CONSTRAINT candidate_job_scores_match_run_id_match_runs_id_fk
  FOREIGN KEY (match_run_id) REFERENCES match_runs(id) ON DELETE CASCADE;

ALTER TABLE applications
  DROP CONSTRAINT IF EXISTS applications_unique_veteran_job;

ALTER TABLE candidate_job_scores
  DROP CONSTRAINT IF EXISTS candidate_job_scores_unique;

ALTER TABLE candidate_job_scores
  ADD CONSTRAINT candidate_job_scores_unique
    UNIQUE (veteran_profile_id, job_id, match_run_id);

ALTER TABLE users
  ADD CONSTRAINT users_external_unique
    UNIQUE (external_source, external_id);

ALTER TABLE companies
  ADD CONSTRAINT companies_external_unique
    UNIQUE (external_source, external_id);

ALTER TABLE jobs
  ADD CONSTRAINT jobs_external_unique
    UNIQUE (external_source, external_id);

ALTER TABLE applications
  ADD CONSTRAINT applications_external_unique
    UNIQUE (external_source, external_id);

ALTER TABLE veteran_profiles
  ADD CONSTRAINT veteran_profiles_years_of_service_nonnegative
    CHECK (years_of_service IS NULL OR years_of_service >= 0),
  ADD CONSTRAINT veteran_profiles_service_dates_valid
    CHECK (service_end_date IS NULL OR service_start_date IS NULL OR service_end_date >= service_start_date),
  ADD CONSTRAINT veteran_profiles_translation_confidence_bounds
    CHECK (translation_confidence IS NULL OR (translation_confidence >= 0 AND translation_confidence <= 1));

ALTER TABLE jobs
  ADD CONSTRAINT jobs_compensation_range_valid
    CHECK (compensation_min IS NULL OR compensation_max IS NULL OR compensation_min <= compensation_max);

ALTER TABLE candidate_job_scores
  ADD CONSTRAINT candidate_job_scores_score_bounds
    CHECK (score >= 0 AND score <= 1),
  ADD CONSTRAINT candidate_job_scores_semantic_score_bounds
    CHECK (semantic_score IS NULL OR (semantic_score >= 0 AND semantic_score <= 1)),
  ADD CONSTRAINT candidate_job_scores_rule_score_bounds
    CHECK (rule_score IS NULL OR (rule_score >= 0 AND rule_score <= 1)),
  ADD CONSTRAINT candidate_job_scores_rank_positive
    CHECK (rank IS NULL OR rank > 0);

DROP INDEX IF EXISTS idx_candidate_job_scores_job_id_score;
DROP INDEX IF EXISTS idx_candidate_job_scores_veteran_id_score;

CREATE INDEX IF NOT EXISTS idx_users_sync_status ON users(sync_status);
CREATE INDEX IF NOT EXISTS idx_companies_sync_status ON companies(sync_status);

CREATE INDEX IF NOT EXISTS idx_jobs_sync_status ON jobs(sync_status);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_by_user_id ON jobs(posted_by_user_id);

CREATE INDEX IF NOT EXISTS idx_veteran_profiles_mos_code ON veteran_profiles(mos_code);

CREATE INDEX IF NOT EXISTS idx_veteran_personas_scope ON veteran_personas(scope);
CREATE INDEX IF NOT EXISTS idx_job_personas_scope ON job_personas(scope);

CREATE INDEX IF NOT EXISTS idx_military_occupations_mos_code ON military_occupations(mos_code);
CREATE INDEX IF NOT EXISTS idx_military_occupations_mos_title ON military_occupations(mos_title);
CREATE INDEX IF NOT EXISTS idx_veteran_occupation_history_profile_id
  ON veteran_occupation_history(veteran_profile_id);
CREATE INDEX IF NOT EXISTS idx_veteran_occupation_history_primary
  ON veteran_occupation_history(veteran_profile_id, is_primary);

CREATE INDEX IF NOT EXISTS idx_application_events_application_id ON application_events(application_id);
CREATE INDEX IF NOT EXISTS idx_application_events_event_type ON application_events(event_type);
CREATE INDEX IF NOT EXISTS idx_application_events_occurred_at ON application_events(occurred_at);

CREATE INDEX IF NOT EXISTS idx_match_runs_created_at ON match_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_match_runs_input_fingerprint ON match_runs(input_fingerprint);

CREATE INDEX IF NOT EXISTS idx_candidate_job_scores_match_run_id ON candidate_job_scores(match_run_id);
CREATE INDEX IF NOT EXISTS idx_candidate_job_scores_job_id_score_desc
  ON candidate_job_scores(job_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_candidate_job_scores_veteran_id_score_desc
  ON candidate_job_scores(veteran_profile_id, score DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_job_score_features_score_id
  ON candidate_job_score_features(candidate_job_score_id);
CREATE INDEX IF NOT EXISTS idx_candidate_job_score_features_reason_code
  ON candidate_job_score_features(reason_code);

DROP INDEX IF EXISTS idx_veteran_profiles_embedding;
DROP INDEX IF EXISTS idx_veteran_personas_embedding;
DROP INDEX IF EXISTS idx_jobs_embedding;
DROP INDEX IF EXISTS idx_job_personas_embedding;

CREATE INDEX IF NOT EXISTS idx_veteran_profiles_embedding
  ON veteran_profiles USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_veteran_personas_embedding
  ON veteran_personas USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_embedding
  ON jobs USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_personas_embedding
  ON job_personas USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;
