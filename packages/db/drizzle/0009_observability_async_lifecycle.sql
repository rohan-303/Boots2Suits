ALTER TABLE veteran_documents
  ADD COLUMN IF NOT EXISTS parse_error_type text,
  ADD COLUMN IF NOT EXISTS parse_error_stack text,
  ADD COLUMN IF NOT EXISTS parse_queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS parse_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS parse_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS parse_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS parse_last_retried_at timestamptz,
  ADD COLUMN IF NOT EXISTS parse_duration_ms integer,
  ADD COLUMN IF NOT EXISTS parse_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parse_retry_count integer NOT NULL DEFAULT 0;

ALTER TABLE veteran_documents
  ADD CONSTRAINT veteran_documents_parse_duration_nonnegative CHECK (parse_duration_ms IS NULL OR parse_duration_ms >= 0),
  ADD CONSTRAINT veteran_documents_parse_attempts_nonnegative CHECK (parse_attempts >= 0),
  ADD CONSTRAINT veteran_documents_parse_retry_count_nonnegative CHECK (parse_retry_count >= 0);

ALTER TABLE match_runs
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_type text,
  ADD COLUMN IF NOT EXISTS error_stack text,
  ADD COLUMN IF NOT EXISTS last_retried_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

ALTER TABLE match_runs
  ADD CONSTRAINT match_runs_duration_nonnegative CHECK (duration_ms IS NULL OR duration_ms >= 0),
  ADD CONSTRAINT match_runs_attempts_nonnegative CHECK (attempts >= 0),
  ADD CONSTRAINT match_runs_retry_count_nonnegative CHECK (retry_count >= 0);
