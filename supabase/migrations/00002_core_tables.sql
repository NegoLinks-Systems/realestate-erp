-- =============================================================
-- 00002: Core tables — org settings, branches, users, roles,
--        permissions, audit, notifications
-- =============================================================

-- -------------------------------------------------------------
-- organization_settings — the white-label heart. Single row.
-- Every page, document, email, and export reads from here.
-- -------------------------------------------------------------
create table public.organization_settings (
  id                    uuid primary key default gen_random_uuid(),
  singleton             boolean not null default true unique check (singleton), -- enforces one row

  organization_name     text not null default 'My Organization',
  product_name          text not null default 'Real Estate ERP',
  application_name      text not null default 'Real Estate ERP',

  logo_url              text,
  favicon_url           text,
  letterhead_url        text,
  stamp_url             text,
  signature_url         text,

  address               text,
  phone_numbers         jsonb not null default '[]',   -- ["+234...", ...]
  whatsapp_numbers      jsonb not null default '[]',
  emails                jsonb not null default '[]',   -- [{"label":"Support","email":"..."}]
  website               text,

  registration_details  jsonb not null default '{}',   -- {"rc_number": "...", ...}
  tax_info              jsonb not null default '{}',   -- {"tax_id": "...", "vat_rate": 7.5}
  social_links          jsonb not null default '{}',   -- {"facebook": "...", ...}

  currency              text not null default 'NGN',
  timezone              text not null default 'Africa/Lagos',
  date_format           text not null default 'DD/MM/YYYY',
  language              text not null default 'en',

  theme_colors          jsonb not null default '{
    "primary": "#1d4ed8", "secondary": "#0f172a", "accent": "#f59e0b"
  }',
  login_branding        jsonb not null default '{}',   -- {"headline": "...", "background_url": "...", "show_logo": true}

  domain_settings       jsonb not null default '{}',   -- {"primary_domain": "", "app_url": "", "portal_url": "", "api_base_url": ""}
  ai_branding           jsonb not null default '{
    "name": "Assistant", "tagline": "", "avatar_url": null
  }',

  email_template_defaults    jsonb not null default '{}',
  document_template_defaults jsonb not null default '{}',

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger set_updated_at before update on public.organization_settings
for each row execute function public.tg_set_updated_at();

-- -------------------------------------------------------------
-- branches
-- -------------------------------------------------------------
create table public.branches (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  code         text unique,               -- e.g. "LAG-01"
  address      text,
  city         text,
  state        text,
  country      text not null default 'Nigeria',
  phone        text,
  email        text,
  is_head_office boolean not null default false,
  status       text not null default 'active' check (status in ('active','inactive')),

  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create trigger set_updated_at before update on public.branches
for each row execute function public.tg_set_updated_at();

create index idx_branches_status on public.branches (status) where deleted_at is null;

-- -------------------------------------------------------------
-- user_profiles — 1:1 with auth.users
-- -------------------------------------------------------------
create table public.user_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null,
  phone        text,
  avatar_url   text,
  job_title    text,
  status       text not null default 'active' check (status in ('active','suspended','invited')),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create trigger set_updated_at before update on public.user_profiles
for each row execute function public.tg_set_updated_at();

-- Auto-create a profile row when a new auth user is created
create or replace function public.tg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, full_name, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email, 'New User'),
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.tg_handle_new_user();

-- -------------------------------------------------------------
-- user_roles — a user may hold multiple roles; branch_id null
-- means the role applies org-wide.
-- -------------------------------------------------------------
create table public.user_roles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         public.app_role not null,
  branch_id    uuid references public.branches(id),

  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  unique (user_id, role, branch_id)
);

create trigger set_updated_at before update on public.user_roles
for each row execute function public.tg_set_updated_at();

create index idx_user_roles_user on public.user_roles (user_id) where deleted_at is null;

-- -------------------------------------------------------------
-- role_permissions — data-driven permission matrix
-- module + action keys, e.g. ('finance', 'approve')
-- -------------------------------------------------------------
create table public.role_permissions (
  id           uuid primary key default gen_random_uuid(),
  role         public.app_role not null,
  module       text not null,
  action       text not null,
  allowed      boolean not null default false,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (role, module, action)
);

create trigger set_updated_at before update on public.role_permissions
for each row execute function public.tg_set_updated_at();

create index idx_role_permissions_lookup on public.role_permissions (role, module, action) where allowed;

-- -------------------------------------------------------------
-- audit_logs — append-only trail for every sensitive mutation
-- -------------------------------------------------------------
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid references auth.users(id),
  module       text not null,
  action       text not null,             -- created / updated / deleted / approved / ...
  entity_type  text not null,
  entity_id    text,
  before_data  jsonb,
  after_data   jsonb,
  ip_address   text,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index idx_audit_logs_entity on public.audit_logs (entity_type, entity_id);
create index idx_audit_logs_actor  on public.audit_logs (actor_id, created_at desc);

-- RPC used by the app's log_activity() helper
create or replace function public.log_activity(
  p_module text,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_before jsonb default null,
  p_after jsonb default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_logs
    (actor_id, module, action, entity_type, entity_id, before_data, after_data)
  values
    (auth.uid(), p_module, p_action, p_entity_type, p_entity_id, p_before, p_after);
$$;

-- -------------------------------------------------------------
-- notifications
-- -------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  type         public.notification_type not null default 'info',
  title        text not null,
  body         text,
  link         text,                      -- in-app route, e.g. /leases/xyz
  read_at      timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create trigger set_updated_at before update on public.notifications
for each row execute function public.tg_set_updated_at();

create index idx_notifications_unread
  on public.notifications (user_id, created_at desc)
  where read_at is null and deleted_at is null;
