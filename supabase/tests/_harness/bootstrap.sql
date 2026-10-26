-- ============================================================
-- Test harness bootstrap (runs as supabase_admin, BEFORE migrations)
-- ============================================================
-- The plain supabase/postgres image ships the auth schema, the API roles and
-- pgTAP, but not everything a hosted project has. This file fills exactly the
-- gaps our migrations and tests touch, so `scripts/db-test.sh` can run the
-- real migrations without the Supabase CLI (which needs the full Docker stack).
--
-- Keep this minimal: anything defined here is a stand-in, and a stand-in that
-- behaves differently from hosted Supabase would make tests lie.
-- ============================================================

-- Hosted Supabase reads the whole claims object (PostgREST >= 9); the image
-- still has the legacy single-claim variant. Match hosted behaviour.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.jwt()
  TO anon, authenticated, service_role, postgres;

-- ------------------------------------------------------------
-- storage: only the columns and helper our bucket migrations use
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS storage.buckets (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  owner              uuid,
  public             boolean DEFAULT false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id  text REFERENCES storage.buckets (id),
  name       text,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1 : array_length(_parts, 1) - 1];
END
$$;

GRANT USAGE ON SCHEMA storage TO postgres, anon, authenticated, service_role;
GRANT ALL ON storage.buckets, storage.objects TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT SELECT ON storage.buckets TO anon, authenticated;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO PUBLIC;

-- ------------------------------------------------------------
-- migration history, mirroring the hosted table we check in check.md
-- ------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version    text PRIMARY KEY,
  name       text,
  statements text[]
);
GRANT USAGE ON SCHEMA supabase_migrations TO postgres;
GRANT ALL ON supabase_migrations.schema_migrations TO postgres;

-- Migrations run as `postgres`, like the hosted SQL editor / CLI. It needs to
-- own triggers on auth.users (signup allowlist), which hosted grants it.
GRANT USAGE ON SCHEMA auth TO postgres;
GRANT ALL ON auth.users TO postgres;
GRANT TRIGGER ON auth.users TO postgres;

-- ------------------------------------------------------------
-- auth.users columns the image's older GoTrue schema lacks but hosted
-- projects have (our triggers react to email_confirmed_at).
-- ------------------------------------------------------------
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS banned_until timestamptz;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;
