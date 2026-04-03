ALTER TABLE job_candidate_exports
  ADD COLUMN IF NOT EXISTS connector_type text NOT NULL DEFAULT 'manual_handoff',
  ADD COLUMN IF NOT EXISTS connector_request_payload jsonb,
  ADD COLUMN IF NOT EXISTS connector_response_summary jsonb,
  ADD COLUMN IF NOT EXISTS error_type text;

CREATE INDEX IF NOT EXISTS idx_job_candidate_exports_connector_type
  ON job_candidate_exports (connector_type);
