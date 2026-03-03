CREATE TABLE IF NOT EXISTS cobuild.build_bot_oauth_codes (
  id BIGSERIAL PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  owner_address TEXT NOT NULL,
  agent_key TEXT NOT NULL DEFAULT 'default',
  scope TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS build_bot_oauth_codes_expires_at_idx
  ON cobuild.build_bot_oauth_codes (expires_at);

CREATE TABLE IF NOT EXISTS cobuild.build_bot_cli_sessions (
  id BIGSERIAL PRIMARY KEY,
  owner_address TEXT NOT NULL,
  agent_key TEXT NOT NULL DEFAULT 'default',
  scope TEXT NOT NULL,
  label TEXT,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS build_bot_cli_sessions_owner_revoked_idx
  ON cobuild.build_bot_cli_sessions (owner_address, revoked_at);

CREATE INDEX IF NOT EXISTS build_bot_cli_sessions_expires_at_idx
  ON cobuild.build_bot_cli_sessions (expires_at);
