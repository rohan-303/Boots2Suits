CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('veteran', 'employer', 'admin');
CREATE TYPE user_status AS ENUM ('active', 'inactive');
CREATE TYPE company_size AS ENUM ('startup', 'small', 'mid_market', 'enterprise');
CREATE TYPE military_branch AS ENUM (
  'army',
  'navy',
  'air_force',
  'marines',
  'space_force',
  'coast_guard',
  'national_guard',
  'other'
);
CREATE TYPE persona_scope AS ENUM ('overall', 'leadership', 'technical', 'culture');
CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'contract', 'internship');
CREATE TYPE location_type AS ENUM ('onsite', 'hybrid', 'remote');
CREATE TYPE job_status AS ENUM ('draft', 'published', 'closed');
CREATE TYPE application_status AS ENUM (
  'applied',
  'screening',
  'interview',
  'offer',
  'hired',
  'rejected',
  'withdrawn'
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text,
  role user_role NOT NULL DEFAULT 'veteran',
  status user_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid,
  name text NOT NULL,
  website_url text,
  headquarters text,
  industry text,
  size company_size DEFAULT 'small',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_owner_user_id_users_id_fk
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE veteran_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  headline text,
  military_branch military_branch,
  years_of_service integer,
  location_city text,
  location_state text,
  resume_text text,
  civilian_summary text,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT veteran_profiles_user_unique UNIQUE (user_id),
  CONSTRAINT veteran_profiles_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE veteran_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veteran_profile_id uuid NOT NULL,
  scope persona_scope NOT NULL DEFAULT 'overall',
  summary text NOT NULL,
  strengths jsonb,
  gaps jsonb,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT veteran_persona_scope_unique UNIQUE (veteran_profile_id, scope),
  CONSTRAINT veteran_personas_veteran_profile_id_veteran_profiles_id_fk
    FOREIGN KEY (veteran_profile_id) REFERENCES veteran_profiles(id) ON DELETE CASCADE
);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  posted_by_user_id uuid,
  title text NOT NULL,
  location_city text,
  location_state text,
  location_type location_type NOT NULL DEFAULT 'onsite',
  employment_type employment_type NOT NULL DEFAULT 'full_time',
  status job_status NOT NULL DEFAULT 'draft',
  compensation_min integer,
  compensation_max integer,
  currency text DEFAULT 'USD',
  description text NOT NULL,
  requirements text,
  embedding vector(1536),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jobs_company_id_companies_id_fk
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT jobs_posted_by_user_id_users_id_fk
    FOREIGN KEY (posted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE job_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  scope persona_scope NOT NULL DEFAULT 'overall',
  summary text NOT NULL,
  required_traits jsonb,
  preferred_traits jsonb,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_persona_scope_unique UNIQUE (job_id, scope),
  CONSTRAINT job_personas_job_id_jobs_id_fk
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veteran_profile_id uuid NOT NULL,
  job_id uuid NOT NULL,
  status application_status NOT NULL DEFAULT 'applied',
  source text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT applications_unique_veteran_job UNIQUE (veteran_profile_id, job_id),
  CONSTRAINT applications_veteran_profile_id_veteran_profiles_id_fk
    FOREIGN KEY (veteran_profile_id) REFERENCES veteran_profiles(id) ON DELETE CASCADE,
  CONSTRAINT applications_job_id_jobs_id_fk
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE TABLE candidate_job_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veteran_profile_id uuid NOT NULL,
  job_id uuid NOT NULL,
  algorithm_version text NOT NULL DEFAULT 'v1',
  score numeric(7, 6) NOT NULL,
  semantic_score numeric(7, 6),
  rule_score numeric(7, 6),
  explanation text NOT NULL,
  explanation_data jsonb,
  rank integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT candidate_job_scores_unique
    UNIQUE (veteran_profile_id, job_id, algorithm_version),
  CONSTRAINT candidate_job_scores_veteran_profile_id_veteran_profiles_id_fk
    FOREIGN KEY (veteran_profile_id) REFERENCES veteran_profiles(id) ON DELETE CASCADE,
  CONSTRAINT candidate_job_scores_job_id_jobs_id_fk
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users(created_at);

CREATE INDEX idx_companies_name ON companies(name);
CREATE INDEX idx_companies_owner_user_id ON companies(owner_user_id);

CREATE INDEX idx_veteran_profiles_military_branch ON veteran_profiles(military_branch);
CREATE INDEX idx_veteran_profiles_location ON veteran_profiles(location_state, location_city);
CREATE INDEX idx_veteran_profiles_embedding
  ON veteran_profiles USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_veteran_personas_profile_id ON veteran_personas(veteran_profile_id);
CREATE INDEX idx_veteran_personas_embedding
  ON veteran_personas USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_jobs_company_id ON jobs(company_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_location ON jobs(location_state, location_city);
CREATE INDEX idx_jobs_published_at ON jobs(published_at);
CREATE INDEX idx_jobs_embedding
  ON jobs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_job_personas_job_id ON job_personas(job_id);
CREATE INDEX idx_job_personas_embedding
  ON job_personas USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_applications_job_id ON applications(job_id);

CREATE INDEX idx_candidate_job_scores_job_id_score ON candidate_job_scores(job_id, score DESC);
CREATE INDEX idx_candidate_job_scores_veteran_id_score
  ON candidate_job_scores(veteran_profile_id, score DESC);
CREATE INDEX idx_candidate_job_scores_rank ON candidate_job_scores(rank);

