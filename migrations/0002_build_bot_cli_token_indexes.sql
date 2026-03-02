CREATE UNIQUE INDEX IF NOT EXISTS build_bot_cli_tokens_token_hash_uq
  ON cobuild.build_bot_cli_tokens (token_hash);

CREATE INDEX IF NOT EXISTS build_bot_cli_tokens_owner_agent_idx
  ON cobuild.build_bot_cli_tokens (owner_address, agent_key);
