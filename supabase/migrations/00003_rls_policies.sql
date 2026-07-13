-- =============================================================
-- 00003: Row Level Security for Phase 0 tables
-- Convention: enable RLS on every table; no table is left open.
-- =============================================================

-- -------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so RLS policies can call them
-- without recursive policy evaluation on user_roles)
-- -------------------------------------------------------------
create or replace function public.user_roles_of(p_user uuid)
returns setof public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_roles
  where user_id = p_user and deleted_at is null;
$$;

create or replace function public.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = p_role and deleted_at is null
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and role in ('super_admin', 'company_owner')
      and deleted_at is null
  );
$$;

-- Permission check used by RLS and by the frontend (via RPC).
-- module/action are free-form text keys seeded in role_permissions.
create or replace function public.has_permission(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    where ur.user_id = auth.uid()
      and ur.deleted_at is null
      and rp.module = p_module
      and rp.action = p_action
      and rp.allowed = true
  );
$$;

-- Branch scoping helper: branches the current user is assigned to.
-- Users with an org-wide role (null branch_id) see all branches.
create or replace function public.user_branch_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.id
  from public.branches b
  where exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.deleted_at is null
      and (ur.branch_id is null or ur.branch_id = b.id)
  );
$$;

alter table public.organization_settings enable row level security;
alter table public.branches              enable row level security;
alter table public.user_profiles         enable row level security;
alter table public.user_roles            enable row level security;
alter table public.role_permissions      enable row level security;
alter table public.audit_logs            enable row level security;
alter table public.notifications         enable row level security;

-- -------------------------------------------------------------
-- organization_settings
-- Everyone authenticated can READ (branding must render for all
-- roles, including tenants). Only settings.update may write.
-- -------------------------------------------------------------
create policy org_settings_read on public.organization_settings
  for select to authenticated
  using (true);

create policy org_settings_update on public.organization_settings
  for update to authenticated
  using (public.has_permission('settings', 'update'))
  with check (public.has_permission('settings', 'update'));

-- No insert/delete policies: the single row is created by seed;
-- the singleton check constraint prevents duplicates anyway.

-- -------------------------------------------------------------
-- branches
-- -------------------------------------------------------------
create policy branches_read on public.branches
  for select to authenticated
  using (
    deleted_at is null
    and (public.is_admin() or id in (select public.user_branch_ids()))
  );

create policy branches_insert on public.branches
  for insert to authenticated
  with check (public.has_permission('branches', 'create'));

create policy branches_update on public.branches
  for update to authenticated
  using (public.has_permission('branches', 'update'))
  with check (public.has_permission('branches', 'update'));

-- Soft delete = update deleted_at, covered by branches_update.
-- No hard-delete policy on purpose.

-- -------------------------------------------------------------
-- user_profiles
-- Users read/update their own profile; user-managers read all.
-- -------------------------------------------------------------
create policy profiles_read_own on public.user_profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_read_all on public.user_profiles
  for select to authenticated
  using (public.has_permission('users', 'view'));

create policy profiles_update_own on public.user_profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_admin on public.user_profiles
  for update to authenticated
  using (public.has_permission('users', 'update'))
  with check (public.has_permission('users', 'update'));

-- -------------------------------------------------------------
-- user_roles
-- Users can see their own roles (needed by the client to build
-- navigation); only users.update may assign/revoke.
-- -------------------------------------------------------------
create policy user_roles_read_own on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);

create policy user_roles_read_all on public.user_roles
  for select to authenticated
  using (public.has_permission('users', 'view'));

create policy user_roles_insert on public.user_roles
  for insert to authenticated
  with check (public.has_permission('users', 'update'));

create policy user_roles_update on public.user_roles
  for update to authenticated
  using (public.has_permission('users', 'update'))
  with check (public.has_permission('users', 'update'));

-- -------------------------------------------------------------
-- role_permissions
-- Readable by all authenticated (client filters navigation with
-- it); writable only by permissions managers. Guard: the matrix
-- editor UI must prevent locking out super_admin, and we enforce
-- it here too.
-- -------------------------------------------------------------
create policy role_permissions_read on public.role_permissions
  for select to authenticated
  using (true);

create policy role_permissions_write on public.role_permissions
  for insert to authenticated
  with check (public.has_permission('permissions', 'update'));

create policy role_permissions_update on public.role_permissions
  for update to authenticated
  using (
    public.has_permission('permissions', 'update')
    and role <> 'super_admin'            -- super_admin matrix is immutable
  )
  with check (
    public.has_permission('permissions', 'update')
    and role <> 'super_admin'
  );

-- -------------------------------------------------------------
-- audit_logs — append-only. Inserts happen via the SECURITY
-- DEFINER log_activity() RPC; reads for auditors/admins only.
-- -------------------------------------------------------------
create policy audit_logs_read on public.audit_logs
  for select to authenticated
  using (public.has_permission('audit', 'view'));

-- No insert/update/delete policies: clients cannot write directly.

-- -------------------------------------------------------------
-- notifications — strictly personal
-- -------------------------------------------------------------
create policy notifications_read_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Inserts come from edge functions using the service role key,
-- which bypasses RLS by design. No client-side insert policy.
