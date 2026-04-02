DO $$
BEGIN
  CREATE TYPE match_run_status AS ENUM ('queued', 'running', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE resume_parse_status ADD VALUE IF NOT EXISTS 'pending';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE resume_parse_status ADD VALUE IF NOT EXISTS 'processing';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE resume_parse_status ADD VALUE IF NOT EXISTS 'completed';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE veteran_documents
SET parse_status = 'pending'
WHERE parse_status = 'uploaded';

UPDATE veteran_documents
SET parse_status = 'completed'
WHERE parse_status = 'parsed';

ALTER TABLE match_runs
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status match_run_status NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message text;

CREATE INDEX IF NOT EXISTS idx_match_runs_status
  ON match_runs(status);

CREATE INDEX IF NOT EXISTS idx_match_runs_requested_by_user_id
  ON match_runs(requested_by_user_id);

CREATE INDEX IF NOT EXISTS idx_match_runs_job_id
  ON match_runs(job_id);
