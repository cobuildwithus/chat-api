CREATE TABLE IF NOT EXISTS cobuild.build_bot_cli_tokens (
  id BIGSERIAL PRIMARY KEY,
  owner_address TEXT NOT NULL,
  agent_key TEXT NOT NULL DEFAULT 'default',
  token_hash TEXT NOT NULL UNIQUE,
  can_write BOOLEAN NOT NULL DEFAULT FALSE,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS build_bot_cli_tokens_owner_agent_idx
  ON cobuild.build_bot_cli_tokens (owner_address, agent_key);
