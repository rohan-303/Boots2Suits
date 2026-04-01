DO $$
BEGIN
  CREATE TYPE veteran_document_type AS ENUM ('resume');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE resume_parse_status AS ENUM ('uploaded', 'parsed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS veteran_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veteran_profile_id uuid NOT NULL REFERENCES veteran_profiles(id) ON DELETE CASCADE,
  document_type veteran_document_type NOT NULL DEFAULT 'resume',
  is_active boolean NOT NULL DEFAULT true,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  storage_path text NOT NULL,
  parser_version text,
  parse_status resume_parse_status NOT NULL DEFAULT 'uploaded',
  parse_confidence numeric(4, 3),
  parse_error text,
  parsed_data jsonb,
  uploaded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  replaced_by_document_id uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  parsed_at timestamptz
);

ALTER TABLE veteran_documents
  ADD CONSTRAINT veteran_documents_replaced_by_fk
  FOREIGN KEY (replaced_by_document_id)
  REFERENCES veteran_documents(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_veteran_documents_profile_type
  ON veteran_documents(veteran_profile_id, document_type);

CREATE INDEX IF NOT EXISTS idx_veteran_documents_active
  ON veteran_documents(veteran_profile_id, is_active);

CREATE INDEX IF NOT EXISTS idx_veteran_documents_uploaded_by_user_id
  ON veteran_documents(uploaded_by_user_id);

DO $$
BEGIN
  ALTER TABLE veteran_documents
  ADD CONSTRAINT veteran_documents_parse_confidence_bounds
  CHECK (
    parse_confidence IS NULL OR (parse_confidence >= 0 AND parse_confidence <= 1)
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
