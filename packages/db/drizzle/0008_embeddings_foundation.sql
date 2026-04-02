ALTER TABLE veteran_personas
  ADD COLUMN IF NOT EXISTS embedding_model_version text,
  ADD COLUMN IF NOT EXISTS embedded_at timestamptz;

ALTER TABLE job_personas
  ADD COLUMN IF NOT EXISTS embedding_model_version text,
  ADD COLUMN IF NOT EXISTS embedded_at timestamptz;
