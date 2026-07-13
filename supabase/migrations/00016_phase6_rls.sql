-- =============================================================
-- 00016: Phase 6 — Visitor & Parking RLS
-- Hosts (any authenticated user incl. tenants) manage their own
-- passes; gate staff operate within property scope via the
-- security-definer functions; parking is staff + tenant-own.
-- =============================================================

alter table public.visitors            enable row level security;
alter table public.visitor_passes      enable row level security;
alter table public.visit_logs          enable row level security;
alter table public.vehicles            enable row level security;
alter table public.parking_zones       enable row level security;
alter table public.parking_spaces      enable row level security;
alter table public.parking_allocations enable row level security;
alter table public.parking_fees        enable row level security;

-- visitors: creator or visitor-staff
create policy visitors_read on public.visitors
  for select to authenticated
  using (deleted_at is null and (
    created_by = auth.uid()
    or public.has_permission('visitors','view')
  ));
create policy visitors_insert on public.visitors
  for insert to authenticated
  with check (public.has_permission('visitors','create'));
create policy visitors_update on public.visitors
  for update to authenticated
  using (created_by = auth.uid() or public.has_permission('visitors','update'))
  with check (created_by = auth.uid() or public.has_permission('visitors','update'));

-- passes: host reads own; staff read in property scope
create policy passes_read_host on public.visitor_passes
  for select to authenticated
  using (host_user_id = auth.uid() and deleted_at is null);
create policy passes_read_staff on public.visitor_passes
  for select to authenticated
  using (deleted_at is null
         and public.has_permission('visitors','view')
         and property_id in (select public.user_property_ids()));

-- A host creates passes for their own property scope (a tenant's
-- scope is the property of their live lease).
create policy passes_insert on public.visitor_passes
  for insert to authenticated
  with check (
    host_user_id = auth.uid()
    and public.has_permission('visitors','create')
    and property_id in (select public.user_property_ids())
  );

-- Hosts can revoke their own pending passes; staff manage in scope.
create policy passes_update_host on public.visitor_passes
  for update to authenticated
  using (host_user_id = auth.uid())
  with check (host_user_id = auth.uid() and status in ('pending','revoked'));
create policy passes_update_staff on public.visitor_passes
  for update to authenticated
  using (public.has_permission('visitors','update')
         and property_id in (select public.user_property_ids()))
  with check (public.has_permission('visitors','update')
              and property_id in (select public.user_property_ids()));

-- visit_logs: written only by the gate functions; host sees logs
-- for their passes, staff see property scope
create policy visit_logs_read on public.visit_logs
  for select to authenticated
  using (exists (
    select 1 from public.visitor_passes vp
    where vp.id = pass_id
      and (vp.host_user_id = auth.uid()
           or (public.has_permission('visitors','view')
               and vp.property_id in (select public.user_property_ids())))
  ));

-- vehicles: tenant own; staff in scope
create policy vehicles_read on public.vehicles
  for select to authenticated
  using (deleted_at is null and (
    tenant_id in (select public.my_tenant_ids())
    or ((public.has_permission('parking','view') or public.has_permission('visitors','view'))
        and property_id in (select public.user_property_ids()))
  ));
create policy vehicles_insert_tenant on public.vehicles
  for insert to authenticated
  with check (tenant_id in (select public.my_tenant_ids())
              and property_id in (select public.user_property_ids()));
create policy vehicles_insert_staff on public.vehicles
  for insert to authenticated
  with check (public.has_permission('parking','update')
              and property_id in (select public.user_property_ids()));
create policy vehicles_update on public.vehicles
  for update to authenticated
  using (public.has_permission('parking','update')
         and property_id in (select public.user_property_ids()))
  with check (public.has_permission('parking','update')
              and property_id in (select public.user_property_ids()));

-- zones/spaces: staff manage; tenants may see spaces (to know
-- their allocation location)
create policy zones_read on public.parking_zones
  for select to authenticated
  using (deleted_at is null
         and property_id in (select public.user_property_ids()));
create policy zones_write on public.parking_zones
  for insert to authenticated
  with check (public.has_permission('parking','update')
              and property_id in (select public.user_property_ids()));
create policy zones_update on public.parking_zones
  for update to authenticated
  using (public.has_permission('parking','update')
         and property_id in (select public.user_property_ids()))
  with check (public.has_permission('parking','update')
              and property_id in (select public.user_property_ids()));

create policy spaces_read on public.parking_spaces
  for select to authenticated
  using (deleted_at is null and exists (
    select 1 from public.parking_zones z
    where z.id = zone_id
      and z.property_id in (select public.user_property_ids())));
create policy spaces_write on public.parking_spaces
  for insert to authenticated
  with check (exists (
    select 1 from public.parking_zones z
    where z.id = zone_id
      and public.has_permission('parking','update')
      and z.property_id in (select public.user_property_ids())));
create policy spaces_update on public.parking_spaces
  for update to authenticated
  using (exists (
    select 1 from public.parking_zones z
    where z.id = zone_id
      and public.has_permission('parking','update')
      and z.property_id in (select public.user_property_ids())))
  with check (exists (
    select 1 from public.parking_zones z
    where z.id = zone_id
      and public.has_permission('parking','update')
      and z.property_id in (select public.user_property_ids())));

-- allocations: tenant reads own; staff manage in scope
create policy allocations_read on public.parking_allocations
  for select to authenticated
  using (deleted_at is null and (
    tenant_id in (select public.my_tenant_ids())
    or (public.has_permission('parking','view') and exists (
      select 1 from public.parking_spaces s
      join public.parking_zones z on z.id = s.zone_id
      where s.id = space_id
        and z.property_id in (select public.user_property_ids())))
  ));
create policy allocations_write on public.parking_allocations
  for insert to authenticated
  with check (public.has_permission('parking','update') and exists (
    select 1 from public.parking_spaces s
    join public.parking_zones z on z.id = s.zone_id
    where s.id = space_id
      and z.property_id in (select public.user_property_ids())));
create policy allocations_update on public.parking_allocations
  for update to authenticated
  using (public.has_permission('parking','update'))
  with check (public.has_permission('parking','update'));

-- parking_fees: staff
create policy fees_read on public.parking_fees
  for select to authenticated
  using (public.has_permission('parking','view')
         and property_id in (select public.user_property_ids()));
create policy fees_write on public.parking_fees
  for insert to authenticated
  with check (public.has_permission('parking','update')
              and property_id in (select public.user_property_ids()));
create policy fees_update on public.parking_fees
  for update to authenticated
  using (public.has_permission('parking','update')
         and property_id in (select public.user_property_ids()))
  with check (public.has_permission('parking','update')
              and property_id in (select public.user_property_ids()));
