-- Fase 00: cimientos — usuarios e identidades de login.
-- Se ejecuta una sola vez (ver src/config/migrate.js).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext UNIQUE,
  password_hash text,               -- null si el usuario solo entra con Google/Apple
  full_name     text NOT NULL,
  role          text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  email_verified_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- citext requiere esta extensión para comparar correos sin distinguir mayúsculas
CREATE EXTENSION IF NOT EXISTS "citext";

CREATE TABLE IF NOT EXISTS auth_identities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      text NOT NULL CHECK (provider IN ('email', 'google', 'apple')),
  provider_uid  text NOT NULL,      -- para "email" es el mismo user_id; para google/apple es el "sub" del token
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_uid)
);

CREATE INDEX IF NOT EXISTS idx_auth_identities_user_id ON auth_identities(user_id);
