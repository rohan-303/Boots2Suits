DO $$
BEGIN
  ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'drafted';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'reviewed';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'shortlisted';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'closed';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
