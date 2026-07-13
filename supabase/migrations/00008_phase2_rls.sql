-- =============================================================
-- 00008: Phase 2 — Scoping upgrade + RLS for tenancy tables
--
-- Replaces user_property_ids() (the contract from Phase 1) to
-- add: landlords see owned properties, tenants see the property
-- of their live lease.
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

  -- Staff with a management-level role
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
    and pm.deleted_at is null

  union

  -- NEW (Phase 2): landlords see properties they own
  select o.property_id
  from public.ownership_records o
  join public.landlords l on l.id = o.landlord_id and l.deleted_at is null
  where l.user_id = auth.uid()
    and o.deleted_at is null
    and (o.end_date is null or o.end_date >= current_date)

  union

  -- NEW (Phase 2): tenants see the property of their live lease
  select u.property_id
  from public.leases le
  join public.tenants t on t.id = le.tenant_id and t.deleted_at is null
  join public.units u   on u.id = le.unit_id
  where t.user_id = auth.uid()
    and le.deleted_at is null
    and le.status in ('active','expiring');
$$;

-- Row-level identity helpers
create or replace function public.my_tenant_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select id from public.tenants
  where user_id = auth.uid() and deleted_at is null;
$$;

create or replace function public.my_landlord_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select id from public.landlords
  where user_id = auth.uid() and deleted_at is null;
$$;

-- Lease visibility: staff in property scope, the tenant on the
-- lease, or a landlord owning the unit's property.
create or replace function public.can_access_lease(p_lease_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.leases le
    join public.units u on u.id = le.unit_id
    where le.id = p_lease_id
      and (
        le.tenant_id in (select public.my_tenant_ids())
        or u.property_id in (select public.user_property_ids())
      )
  );
$$;

-- Tenants may read the unit they lease (they lack units.view in
-- the permission matrix; this narrow policy is the exception).
create policy units_read_tenant on public.units
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.leases le
      where le.unit_id = units.id
        and le.deleted_at is null
        and le.status in ('active','expiring')
        and le.tenant_id in (select public.my_tenant_ids())
    )
  );

-- -------------------------------------------------------------
-- Enable RLS
-- -------------------------------------------------------------
alter table public.landlords         enable row level security;
alter table public.ownership_records enable row level security;
alter table public.tenants           enable row level security;
alter table public.tenant_documents  enable row level security;
alter table public.leases            enable row level security;
alter table public.lease_documents   enable row level security;
alter table public.security_deposits enable row level security;
alter table public.rent_reviews      enable row level security;
alter table public.complaints        enable row level security;
alter table public.notices           enable row level security;

-- -------------------------------------------------------------
-- landlords
-- -------------------------------------------------------------
create policy landlords_read_own on public.landlords
  for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);

create policy landlords_read_staff on public.landlords
  for select to authenticated
  using (deleted_at is null and public.has_permission('landlords','view')
         and not has_role('landlord') and not has_role('property_owner')
         or public.is_admin());

create policy landlords_insert on public.landlords
  for insert to authenticated
  with check (public.has_permission('landlords','create'));

create policy landlords_update on public.landlords
  for update to authenticated
  using (public.has_permission('landlords','update'))
  with check (public.has_permission('landlords','update'));

-- -------------------------------------------------------------
-- ownership_records
-- -------------------------------------------------------------
create policy ownership_read on public.ownership_records
  for select to authenticated
  using (deleted_at is null and (
    landlord_id in (select public.my_landlord_ids())
    or (public.has_permission('landlords','view')
        and property_id in (select public.user_property_ids()))
  ));

create policy ownership_insert on public.ownership_records
  for insert to authenticated
  with check (public.has_permission('landlords','update')
              and property_id in (select public.user_property_ids()));

create policy ownership_update on public.ownership_records
  for update to authenticated
  using (public.has_permission('landlords','update')
         and property_id in (select public.user_property_ids()))
  with check (public.has_permission('landlords','update')
              and property_id in (select public.user_property_ids()));

-- -------------------------------------------------------------
-- tenants
-- -------------------------------------------------------------
create policy tenants_read_own on public.tenants
  for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);

create policy tenants_read_staff on public.tenants
  for select to authenticated
  using (deleted_at is null and public.has_permission('tenants','view')
         and not has_role('tenant')
         or public.is_admin());

create policy tenants_insert on public.tenants
  for insert to authenticated
  with check (public.has_permission('tenants','create'));

create policy tenants_update on public.tenants
  for update to authenticated
  using (public.has_permission('tenants','update'))
  with check (public.has_permission('tenants','update'));

-- -------------------------------------------------------------
-- tenant_documents — the tenant and tenant-staff
-- -------------------------------------------------------------
create policy tenant_docs_read on public.tenant_documents
  for select to authenticated
  using (deleted_at is null and (
    tenant_id in (select public.my_tenant_ids())
    or (public.has_permission('tenants','view') and not has_role('tenant'))
    or public.is_admin()
  ));

create policy tenant_docs_write on public.tenant_documents
  for insert to authenticated
  with check (public.has_permission('tenants','update')
              or tenant_id in (select public.my_tenant_ids()));

create policy tenant_docs_update on public.tenant_documents
  for update to authenticated
  using (public.has_permission('tenants','update'))
  with check (public.has_permission('tenants','update'));

-- -------------------------------------------------------------
-- leases — staff (property-scoped), the tenant, owning landlord
-- -------------------------------------------------------------
create policy leases_read on public.leases
  for select to authenticated
  using (deleted_at is null and public.can_access_lease(id));

create policy leases_insert on public.leases
  for insert to authenticated
  with check (
    public.has_permission('leases','create')
    and exists (select 1 from public.units u
                where u.id = unit_id
                  and u.property_id in (select public.user_property_ids()))
  );

create policy leases_update on public.leases
  for update to authenticated
  using (
    public.has_permission('leases','update')
    and exists (select 1 from public.units u
                where u.id = unit_id
                  and u.property_id in (select public.user_property_ids()))
  )
  with check (
    public.has_permission('leases','update')
    and exists (select 1 from public.units u
                where u.id = unit_id
                  and u.property_id in (select public.user_property_ids()))
  );

-- lease children follow the lease
create policy lease_docs_read on public.lease_documents
  for select to authenticated
  using (deleted_at is null and public.can_access_lease(lease_id));
create policy lease_docs_write on public.lease_documents
  for insert to authenticated
  with check (public.has_permission('leases','update') and public.can_access_lease(lease_id));
create policy lease_docs_update on public.lease_documents
  for update to authenticated
  using (public.has_permission('leases','update') and public.can_access_lease(lease_id))
  with check (public.has_permission('leases','update') and public.can_access_lease(lease_id));

create policy deposits_read on public.security_deposits
  for select to authenticated
  using (deleted_at is null and public.can_access_lease(lease_id));
create policy deposits_write on public.security_deposits
  for insert to authenticated
  with check (public.has_permission('leases','update') and public.can_access_lease(lease_id));
create policy deposits_update on public.security_deposits
  for update to authenticated
  using (public.has_permission('finance','update') and public.can_access_lease(lease_id))
  with check (public.has_permission('finance','update') and public.can_access_lease(lease_id));

create policy rent_reviews_read on public.rent_reviews
  for select to authenticated
  using (deleted_at is null and public.can_access_lease(lease_id));
create policy rent_reviews_write on public.rent_reviews
  for insert to authenticated
  with check (public.has_permission('leases','update') and public.can_access_lease(lease_id));
create policy rent_reviews_update on public.rent_reviews
  for update to authenticated
  using (public.has_permission('leases','update') and public.can_access_lease(lease_id))
  with check (public.has_permission('leases','update') and public.can_access_lease(lease_id));

-- -------------------------------------------------------------
-- complaints — tenant creates own; staff manage in scope
-- -------------------------------------------------------------
create policy complaints_read on public.complaints
  for select to authenticated
  using (deleted_at is null and (
    tenant_id in (select public.my_tenant_ids())
    or (public.has_permission('tenants','view')
        and property_id in (select public.user_property_ids()))
  ));

create policy complaints_insert_tenant on public.complaints
  for insert to authenticated
  with check (tenant_id in (select public.my_tenant_ids()));

create policy complaints_insert_staff on public.complaints
  for insert to authenticated
  with check (public.has_permission('tenants','update')
              and property_id in (select public.user_property_ids()));

create policy complaints_update on public.complaints
  for update to authenticated
  using (public.has_permission('tenants','update')
         and property_id in (select public.user_property_ids()))
  with check (public.has_permission('tenants','update')
              and property_id in (select public.user_property_ids()));

-- -------------------------------------------------------------
-- notices — tenant reads/acknowledges own; staff issue in scope
-- -------------------------------------------------------------
create policy notices_read on public.notices
  for select to authenticated
  using (deleted_at is null and (
    tenant_id in (select public.my_tenant_ids())
    or (public.has_permission('tenants','view')
        and (lease_id is null or public.can_access_lease(lease_id)))
  ));

create policy notices_insert on public.notices
  for insert to authenticated
  with check (public.has_permission('tenants','update'));

create policy notices_ack_tenant on public.notices
  for update to authenticated
  using (tenant_id in (select public.my_tenant_ids()))
  with check (tenant_id in (select public.my_tenant_ids()));

create policy notices_update_staff on public.notices
  for update to authenticated
  using (public.has_permission('tenants','update'))
  with check (public.has_permission('tenants','update'));
