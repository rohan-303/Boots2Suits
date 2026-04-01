ALTER TABLE veteran_profiles
  ADD COLUMN IF NOT EXISTS work_authorization text,
  ADD COLUMN IF NOT EXISTS relocation_preference text,
  ADD COLUMN IF NOT EXISTS responsibilities_summary text,
  ADD COLUMN IF NOT EXISTS key_skills jsonb,
  ADD COLUMN IF NOT EXISTS tools_technologies jsonb,
  ADD COLUMN IF NOT EXISTS leadership_experience text,
  ADD COLUMN IF NOT EXISTS industries_of_interest jsonb,
  ADD COLUMN IF NOT EXISTS desired_roles jsonb,
  ADD COLUMN IF NOT EXISTS preferred_industries jsonb,
  ADD COLUMN IF NOT EXISTS salary_expectation_min integer,
  ADD COLUMN IF NOT EXISTS salary_expectation_max integer,
  ADD COLUMN IF NOT EXISTS preferred_work_modes jsonb,
  ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;

ALTER TABLE veteran_profiles
  ADD CONSTRAINT veteran_profiles_salary_expectation_valid
  CHECK (
    salary_expectation_min IS NULL
    OR salary_expectation_max IS NULL
    OR salary_expectation_min <= salary_expectation_max
  );

ALTER TABLE veteran_personas
  ADD COLUMN IF NOT EXISTS role_clusters jsonb,
  ADD COLUMN IF NOT EXISTS experience_level text,
  ADD COLUMN IF NOT EXISTS leadership_profile text,
  ADD COLUMN IF NOT EXISTS technical_profile text,
  ADD COLUMN IF NOT EXISTS suggested_job_titles jsonb,
  ADD COLUMN IF NOT EXISTS model_version text,
  ADD COLUMN IF NOT EXISTS source_snapshot_hash text;

