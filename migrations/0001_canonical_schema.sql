-- Canonical schema for chat-api (single migration baseline)

CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS cobuild;
CREATE SCHEMA IF NOT EXISTS farcaster;
CREATE SCHEMA IF NOT EXISTS "cobuild-onchain";

CREATE TABLE IF NOT EXISTS cobuild.chat (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT,
  data JSON NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL,
  "user" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cobuild.chat_message (
  id TEXT PRIMARY KEY,
  "chatId" TEXT NOT NULL REFERENCES cobuild.chat(id),
  "clientId" TEXT,
  role TEXT NOT NULL,
  parts JSONB NOT NULL,
  metadata JSONB,
  position INTEGER NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_message_chat_client_id_uq
  ON cobuild.chat_message ("chatId", "clientId");

CREATE TABLE IF NOT EXISTS farcaster.profiles (
  fname TEXT,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  verified_addresses TEXT[],
  manual_verified_addresses TEXT[],
  neynar_user_score DOUBLE PRECISION,
  updated_at TIMESTAMPTZ,
  hidden_at TIMESTAMPTZ,
  fid BIGINT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS farcaster.casts (
  hash BYTEA PRIMARY KEY,
  deleted_at TIMESTAMPTZ,
  hidden_at TIMESTAMPTZ,
  timestamp TIMESTAMPTZ,
  fid BIGINT,
  parent_hash BYTEA,
  text TEXT,
  text_embedding VECTOR(256),
  root_parent_hash BYTEA,
  root_parent_url TEXT,
  view_count BIGINT,
  reply_count BIGINT,
  last_reply_at TIMESTAMPTZ,
  last_reply_fid BIGINT,
  last_activity_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS casts_fid_idx ON farcaster.casts (fid);
CREATE INDEX IF NOT EXISTS casts_parent_hash_idx ON farcaster.casts (parent_hash);
CREATE INDEX IF NOT EXISTS casts_root_parent_hash_idx ON farcaster.casts (root_parent_hash);
CREATE INDEX IF NOT EXISTS casts_root_parent_url_idx ON farcaster.casts (root_parent_url);
CREATE INDEX IF NOT EXISTS casts_last_activity_desc_idx
  ON farcaster.casts (last_activity_at DESC)
  WHERE parent_hash IS NULL;

CREATE TABLE IF NOT EXISTS cobuild.cli_oauth_codes (
  id BIGSERIAL PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  owner_address TEXT NOT NULL,
  agent_key TEXT NOT NULL,
  scope TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS cli_oauth_codes_expires_at_idx
  ON cobuild.cli_oauth_codes (expires_at);

CREATE TABLE IF NOT EXISTS cobuild.cli_cli_sessions (
  id BIGSERIAL PRIMARY KEY,
  owner_address TEXT NOT NULL,
  agent_key TEXT NOT NULL,
  scope TEXT NOT NULL,
  label TEXT,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS cli_cli_sessions_owner_revoked_idx
  ON cobuild.cli_cli_sessions (owner_address, revoked_at);

CREATE INDEX IF NOT EXISTS cli_cli_sessions_expires_at_idx
  ON cobuild.cli_cli_sessions (expires_at);

CREATE TABLE IF NOT EXISTS "cobuild-onchain".project (
  chain_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  sucker_group_id TEXT,
  accounting_token TEXT NOT NULL,
  accounting_decimals INTEGER NOT NULL,
  accounting_token_symbol TEXT NOT NULL,
  erc20_symbol TEXT,
  current_ruleset_id BIGINT NOT NULL,
  erc20_supply TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "cobuild-onchain".pay_event (
  chain_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  payer TEXT NOT NULL,
  amount TEXT NOT NULL,
  newly_issued_token_count TEXT NOT NULL,
  effective_token_count TEXT NOT NULL,
  sucker_group_id TEXT
);

CREATE TABLE IF NOT EXISTS "cobuild-onchain".participant (
  chain_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  address TEXT NOT NULL,
  balance TEXT NOT NULL,
  first_owned INTEGER
);

CREATE TABLE IF NOT EXISTS "cobuild-onchain".ruleset (
  chain_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  ruleset_id BIGINT NOT NULL,
  start BIGINT NOT NULL,
  weight TEXT NOT NULL,
  reserved_percent INTEGER NOT NULL,
  cash_out_tax_rate INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cobuild.token_metadata (
  chain_id INTEGER NOT NULL,
  address TEXT NOT NULL,
  price_usdc TEXT
);
