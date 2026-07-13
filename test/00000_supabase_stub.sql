-- Test-only stub emulating the parts of Supabase that the
-- migrations reference (auth schema, auth.uid(), roles).
-- NOT part of the deployable migrations.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}',
  created_at timestamptz default now()
);

create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;

-- Real Supabase grants authenticated access to auth.uid()
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
