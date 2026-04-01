ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS hiring_roles jsonb,
  ADD COLUMN IF NOT EXISTS hiring_volume text,
  ADD COLUMN IF NOT EXISTS veteran_hiring_priority boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS clearance_sensitive_roles boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS hiring_regions jsonb,
  ADD COLUMN IF NOT EXISTS recruiter_title text,
  ADD COLUMN IF NOT EXISTS recruiter_team text,
  ADD COLUMN IF NOT EXISTS contact_preferences jsonb,
  ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS must_have_skills jsonb,
  ADD COLUMN IF NOT EXISTS nice_to_have_skills jsonb,
  ADD COLUMN IF NOT EXISTS required_experience_level text,
  ADD COLUMN IF NOT EXISTS clearance_requirement text,
  ADD COLUMN IF NOT EXISTS travel_requirement text;

ALTER TABLE job_personas
  ADD COLUMN IF NOT EXISTS leadership_level text,
  ADD COLUMN IF NOT EXISTS execution_vs_strategy text,
  ADD COLUMN IF NOT EXISTS environment_type text,
  ADD COLUMN IF NOT EXISTS technical_depth text,
  ADD COLUMN IF NOT EXISTS suggested_candidate_archetypes jsonb,
  ADD COLUMN IF NOT EXISTS priority_signals jsonb,
  ADD COLUMN IF NOT EXISTS disqualifiers jsonb,
  ADD COLUMN IF NOT EXISTS suggested_role_family text,
  ADD COLUMN IF NOT EXISTS model_version text,
  ADD COLUMN IF NOT EXISTS source_snapshot_hash text;

