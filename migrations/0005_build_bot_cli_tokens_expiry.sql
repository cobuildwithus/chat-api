ALTER TABLE IF EXISTS cobuild.build_bot_cli_tokens
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE cobuild.build_bot_cli_tokens
SET expires_at = CASE
  WHEN can_write THEN NOW() + INTERVAL '30 days'
  ELSE NOW() + INTERVAL '90 days'
END
WHERE expires_at IS NULL;

ALTER TABLE IF EXISTS cobuild.build_bot_cli_tokens
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS build_bot_cli_tokens_expires_at_idx
  ON cobuild.build_bot_cli_tokens (expires_at);
