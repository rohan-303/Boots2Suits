DO $$
BEGIN
  CREATE TYPE async_dead_letter_status AS ENUM ('failed', 'replayed', 'resolved');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE veteran_personas
  ADD COLUMN IF NOT EXISTS embedding_error_type text,
  ADD COLUMN IF NOT EXISTS embedding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS embedding_last_retried_at timestamptz,
  ADD COLUMN IF NOT EXISTS embedding_duration_ms integer,
  ADD COLUMN IF NOT EXISTS embedding_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS embedding_retry_count integer NOT NULL DEFAULT 0;

ALTER TABLE job_personas
  ADD COLUMN IF NOT EXISTS embedding_error_type text,
  ADD COLUMN IF NOT EXISTS embedding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS embedding_last_retried_at timestamptz,
  ADD COLUMN IF NOT EXISTS embedding_duration_ms integer,
  ADD COLUMN IF NOT EXISTS embedding_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS embedding_retry_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE veteran_personas
    ADD CONSTRAINT veteran_personas_embedding_duration_nonnegative
      CHECK (embedding_duration_ms IS NULL OR embedding_duration_ms >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE veteran_personas
    ADD CONSTRAINT veteran_personas_embedding_attempts_nonnegative
      CHECK (embedding_attempts >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE veteran_personas
    ADD CONSTRAINT veteran_personas_embedding_retry_count_nonnegative
      CHECK (embedding_retry_count >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE job_personas
    ADD CONSTRAINT job_personas_embedding_duration_nonnegative
      CHECK (embedding_duration_ms IS NULL OR embedding_duration_ms >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE job_personas
    ADD CONSTRAINT job_personas_embedding_attempts_nonnegative
      CHECK (embedding_attempts >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE job_personas
    ADD CONSTRAINT job_personas_embedding_retry_count_nonnegative
      CHECK (embedding_retry_count >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS async_job_dead_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name text NOT NULL,
  job_name text NOT NULL,
  bullmq_job_id text NOT NULL,
  idempotency_key text,
  payload jsonb,
  failure_status async_dead_letter_status NOT NULL DEFAULT 'failed',
  error_type text NOT NULL,
  error_message text NOT NULL,
  error_stack text,
  attempts_made integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 1,
  failed_at timestamptz NOT NULL DEFAULT now(),
  replay_count integer NOT NULL DEFAULT 0,
  last_replay_at timestamptz,
  last_replay_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  last_replay_job_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT async_job_dead_letters_attempts_nonnegative CHECK (attempts_made >= 0 AND max_attempts >= 1),
  CONSTRAINT async_job_dead_letters_replay_count_nonnegative CHECK (replay_count >= 0),
  CONSTRAINT async_job_dead_letters_bullmq_unique UNIQUE (queue_name, bullmq_job_id)
);

CREATE INDEX IF NOT EXISTS idx_async_job_dead_letters_queue_name
  ON async_job_dead_letters (queue_name);

CREATE INDEX IF NOT EXISTS idx_async_job_dead_letters_failure_status
  ON async_job_dead_letters (failure_status);

CREATE INDEX IF NOT EXISTS idx_async_job_dead_letters_failed_at
  ON async_job_dead_letters (failed_at);

CREATE INDEX IF NOT EXISTS idx_async_job_dead_letters_last_replay_by
  ON async_job_dead_letters (last_replay_by_user_id);
