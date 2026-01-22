-- Minimal schema for chat-api

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
  updated_at TIMESTAMPTZ,
  fid BIGINT PRIMARY KEY
);
