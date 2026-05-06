-- LOCAL DEV ONLY — never applied to Supabase / production.
-- Mirrors enough of GoTrue's auth.users schema for our FK and trigger to resolve.
-- The migrate.ts runner reads LOCAL_DEV=true and applies this before the
-- generated migrations.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone varchar(20) UNIQUE,
  email varchar(320) UNIQUE,
  encrypted_password text,
  email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Stub of auth.uid() so RLS policies can be defined locally without erroring.
-- In production, Supabase provides the real implementation.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
