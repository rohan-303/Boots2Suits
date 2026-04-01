CREATE TABLE IF NOT EXISTS user_auth_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_auth_credentials_user_id
  ON user_auth_credentials(user_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_sessions_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_revoked_at ON auth_sessions(revoked_at);

