-- Minimal schema for chat-api

CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS cobuild;
CREATE SCHEMA IF NOT EXISTS farcaster;

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
  hidden_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
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
  view_count BIGINT NOT NULL DEFAULT 0,
  reply_count BIGINT NOT NULL DEFAULT 0,
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
