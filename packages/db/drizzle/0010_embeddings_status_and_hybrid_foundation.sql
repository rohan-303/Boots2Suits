DO $$
BEGIN
  CREATE TYPE embedding_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE veteran_personas
  ADD COLUMN IF NOT EXISTS embedding_status embedding_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS embedding_error text,
  ADD COLUMN IF NOT EXISTS embedding_queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS embedding_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS embedding_failed_at timestamptz;

ALTER TABLE job_personas
  ADD COLUMN IF NOT EXISTS embedding_status embedding_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS embedding_error text,
  ADD COLUMN IF NOT EXISTS embedding_queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS embedding_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS embedding_failed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_veteran_personas_embedding_status
  ON veteran_personas (embedding_status);

CREATE INDEX IF NOT EXISTS idx_job_personas_embedding_status
  ON job_personas (embedding_status);
