ALTER TABLE IF EXISTS cobuild.build_bot_cli_tokens
  ADD COLUMN IF NOT EXISTS can_write BOOLEAN;

UPDATE cobuild.build_bot_cli_tokens
SET can_write = FALSE
WHERE can_write IS NULL;

ALTER TABLE IF EXISTS cobuild.build_bot_cli_tokens
  ALTER COLUMN can_write SET DEFAULT FALSE;

ALTER TABLE IF EXISTS cobuild.build_bot_cli_tokens
  ALTER COLUMN can_write SET NOT NULL;

DO $$
DECLARE
  has_token_hash_constraint BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'cobuild.build_bot_cli_tokens'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%(token_hash)%'
  )
  INTO has_token_hash_constraint;

  IF has_token_hash_constraint THEN
    DROP INDEX IF EXISTS cobuild.build_bot_cli_tokens_token_hash_uq;
  END IF;
END $$;
