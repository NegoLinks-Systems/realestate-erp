-- =============================================================
-- 00006: Phase 1 — Property scoping helper + RLS
--
-- Scoping model:
--   * super_admin / company_owner       → all properties
--   * org-wide staff role (branch NULL) → all properties
--   * branch-scoped staff role          → properties in that branch
--   * property-level roles (property_manager, estate_manager,
--     facility_manager, leasing_officer, maintenance_officer,
--     security_officer, receptionist)   → assigned properties only
--     (via property_managers)
--   * landlord / tenant / contractor / vendor → none yet;
--     Phase 2/4 REPLACE user_property_ids() to add ownership,
--     lease, and work-order joins. This function is the single
--     scoping source of truth going forward.
-- =============================================================

create or replace function public.user_property_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  -- Admins: everything
  select p.id from public.properties p
  where p.deleted_at is null and public.is_admin()

  union

  -- Staff with a management-level role: org-wide (branch_id null)
  -- sees all; branch-scoped sees the branch's properties
  select p.id
  from public.properties p
  join public.user_roles ur
    on ur.user_id = auth.uid()
   and ur.deleted_at is null
   and ur.role in ('regional_manager','branch_manager','accountant',
                   'procurement_officer','sales_officer','auditor')
   and (ur.branch_id is null or ur.branch_id = p.branch_id)
  where p.deleted_at is null

  union

  -- Property-level operational roles: explicit assignment
  select pm.property_id
  from public.property_managers pm
  join public.user_roles ur
    on ur.user_id = auth.uid()
   and ur.deleted_at is null
   and ur.role in ('property_manager','estate_manager','facility_manager',
                   'leasing_officer','maintenance_officer',
                   'security_officer','receptionist')
  where pm.user_id = auth.uid()
    and pm.deleted_at is null;
$$;

-- Convenience: does the caller have access to a given property?
create or replace function public.can_access_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_property_id in (select public.user_property_ids());
$$;

-- -------------------------------------------------------------
-- Enable RLS
-- -------------------------------------------------------------
alter table public.properties         enable row level security;
alter table public.buildings          enable row level security;
alter table public.floors             enable row level security;
alter table public.units              enable row level security;
alter table public.land_parcels       enable row level security;
alter table public.property_photos    enable row level security;
alter table public.property_documents enable row level security;
alter table public.property_managers  enable row level security;

-- -------------------------------------------------------------
-- properties
-- -------------------------------------------------------------
create policy properties_read on public.properties
  for select to authenticated
  using (
    deleted_at is null
    and public.has_permission('properties','view')
    and public.can_access_property(id)
  );

create policy properties_insert on public.properties
  for insert to authenticated
  with check (
    public.has_permission('properties','create')
    and branch_id in (select public.user_branch_ids())
  );

create policy properties_update on public.properties
  for update to authenticated
  using (
    public.has_permission('properties','update')
    and public.can_access_property(id)
  )
  with check (
    public.has_permission('properties','update')
    and branch_id in (select public.user_branch_ids())
  );

-- -------------------------------------------------------------
-- Child tables: one macro-pattern — permission on the module +
-- access to the parent property.
-- -------------------------------------------------------------
create policy buildings_read on public.buildings
  for select to authenticated
  using (deleted_at is null
         and public.has_permission('properties','view')
         and public.can_access_property(property_id));

create policy buildings_write on public.buildings
  for insert to authenticated
  with check (public.has_permission('properties','update')
              and public.can_access_property(property_id));

create policy buildings_update on public.buildings
  for update to authenticated
  using (public.has_permission('properties','update')
         and public.can_access_property(property_id))
  with check (public.has_permission('properties','update')
              and public.can_access_property(property_id));

create policy floors_read on public.floors
  for select to authenticated
  using (deleted_at is null and exists (
    select 1 from public.buildings b
    where b.id = building_id
      and public.has_permission('properties','view')
      and public.can_access_property(b.property_id)));

create policy floors_write on public.floors
  for insert to authenticated
  with check (exists (
    select 1 from public.buildings b
    where b.id = building_id
      and public.has_permission('properties','update')
      and public.can_access_property(b.property_id)));

create policy floors_update on public.floors
  for update to authenticated
  using (exists (
    select 1 from public.buildings b
    where b.id = building_id
      and public.has_permission('properties','update')
      and public.can_access_property(b.property_id)))
  with check (exists (
    select 1 from public.buildings b
    where b.id = building_id
      and public.has_permission('properties','update')
      and public.can_access_property(b.property_id)));

create policy units_read on public.units
  for select to authenticated
  using (deleted_at is null
         and public.has_permission('units','view')
         and public.can_access_property(property_id));

create policy units_insert on public.units
  for insert to authenticated
  with check (public.has_permission('units','create')
              and public.can_access_property(property_id));

create policy units_update on public.units
  for update to authenticated
  using (public.has_permission('units','update')
         and public.can_access_property(property_id))
  with check (public.has_permission('units','update')
              and public.can_access_property(property_id));

create policy land_parcels_read on public.land_parcels
  for select to authenticated
  using (deleted_at is null
         and public.has_permission('properties','view')
         and public.can_access_property(property_id));

create policy land_parcels_write on public.land_parcels
  for insert to authenticated
  with check (public.has_permission('properties','update')
              and public.can_access_property(property_id));

create policy land_parcels_update on public.land_parcels
  for update to authenticated
  using (public.has_permission('properties','update')
         and public.can_access_property(property_id))
  with check (public.has_permission('properties','update')
              and public.can_access_property(property_id));

create policy photos_read on public.property_photos
  for select to authenticated
  using (deleted_at is null
         and public.has_permission('properties','view')
         and public.can_access_property(property_id));

create policy photos_write on public.property_photos
  for insert to authenticated
  with check (public.has_permission('properties','update')
              and public.can_access_property(property_id));

create policy photos_update on public.property_photos
  for update to authenticated
  using (public.has_permission('properties','update')
         and public.can_access_property(property_id))
  with check (public.has_permission('properties','update')
              and public.can_access_property(property_id));

create policy documents_read on public.property_documents
  for select to authenticated
  using (deleted_at is null
         and public.has_permission('properties','view')
         and public.can_access_property(property_id));

create policy documents_write on public.property_documents
  for insert to authenticated
  with check (public.has_permission('properties','update')
              and public.can_access_property(property_id));

create policy documents_update on public.property_documents
  for update to authenticated
  using (public.has_permission('properties','update')
         and public.can_access_property(property_id))
  with check (public.has_permission('properties','update')
              and public.can_access_property(property_id));

-- property_managers: only user-managers assign; assignees can
-- read their own assignments (needed for navigation)
create policy pm_read_own on public.property_managers
  for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);

create policy pm_read_admin on public.property_managers
  for select to authenticated
  using (public.has_permission('users','view'));

create policy pm_write on public.property_managers
  for insert to authenticated
  with check (public.has_permission('users','update'));

create policy pm_update on public.property_managers
  for update to authenticated
  using (public.has_permission('users','update'))
  with check (public.has_permission('users','update'));
