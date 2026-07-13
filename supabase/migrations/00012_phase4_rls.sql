-- =============================================================
-- 00012: Phase 4 — Maintenance RLS
-- Access model:
--   tenants     → create/read their own requests
--   contractors → read/update work orders assigned to them,
--                 add cost items to those work orders
--   staff       → maintenance.* permission + property scope
--   verification (status → verified) additionally requires
--   maintenance.approve, enforced by policy on that transition
-- =============================================================

create or replace function public.my_contractor_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select id from public.contractors
  where user_id = auth.uid() and deleted_at is null;
$$;

alter table public.maintenance_requests  enable row level security;
alter table public.contractors           enable row level security;
alter table public.work_orders           enable row level security;
alter table public.work_order_items      enable row level security;
alter table public.maintenance_schedules enable row level security;

-- -------------------------------------------------------------
-- maintenance_requests
-- -------------------------------------------------------------
create policy requests_read on public.maintenance_requests
  for select to authenticated
  using (deleted_at is null and (
    tenant_id in (select public.my_tenant_ids())
    or (public.has_permission('maintenance','view')
        and property_id in (select public.user_property_ids()))
  ));

-- Tenant raises a request for themselves, on the property of a
-- live lease of theirs (their property scope).
create policy requests_insert_tenant on public.maintenance_requests
  for insert to authenticated
  with check (
    tenant_id in (select public.my_tenant_ids())
    and property_id in (select public.user_property_ids())
  );

create policy requests_insert_staff on public.maintenance_requests
  for insert to authenticated
  with check (
    public.has_permission('maintenance','create')
    and property_id in (select public.user_property_ids())
  );

create policy requests_update on public.maintenance_requests
  for update to authenticated
  using (public.has_permission('maintenance','update')
         and property_id in (select public.user_property_ids()))
  with check (public.has_permission('maintenance','update')
              and property_id in (select public.user_property_ids()));

-- -------------------------------------------------------------
-- contractors — staff manage; a contractor reads their own row
-- -------------------------------------------------------------
create policy contractors_read_own on public.contractors
  for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);

create policy contractors_read_staff on public.contractors
  for select to authenticated
  using (deleted_at is null and public.has_permission('maintenance','view')
         and not has_role('contractor')
         or public.is_admin());

create policy contractors_insert on public.contractors
  for insert to authenticated
  with check (public.has_permission('maintenance','update'));

create policy contractors_update on public.contractors
  for update to authenticated
  using (public.has_permission('maintenance','update'))
  with check (public.has_permission('maintenance','update'));

-- -------------------------------------------------------------
-- work_orders
-- -------------------------------------------------------------
create policy wo_read on public.work_orders
  for select to authenticated
  using (deleted_at is null and (
    contractor_id in (select public.my_contractor_ids())
    or assigned_user_id = auth.uid()
    or (public.has_permission('maintenance','view')
        and property_id in (select public.user_property_ids()))
  ));

create policy wo_insert on public.work_orders
  for insert to authenticated
  with check (public.has_permission('maintenance','create')
              and property_id in (select public.user_property_ids()));

-- Staff update within scope. Verification (→ verified) requires
-- maintenance.approve; contractors can never set it.
create policy wo_update_staff on public.work_orders
  for update to authenticated
  using (public.has_permission('maintenance','update')
         and property_id in (select public.user_property_ids()))
  with check (
    public.has_permission('maintenance','update')
    and property_id in (select public.user_property_ids())
    and (status <> 'verified' or public.has_permission('maintenance','approve'))
  );

-- Assigned contractor progresses the job but cannot verify or
-- reassign it (assignment columns pinned by the with check).
create policy wo_update_contractor on public.work_orders
  for update to authenticated
  using (contractor_id in (select public.my_contractor_ids()))
  with check (
    contractor_id in (select public.my_contractor_ids())
    and status in ('in_progress','on_hold','completed')
  );

-- -------------------------------------------------------------
-- work_order_items — staff in scope, or the assigned contractor
-- -------------------------------------------------------------
create policy wo_items_read on public.work_order_items
  for select to authenticated
  using (deleted_at is null and exists (
    select 1 from public.work_orders w
    where w.id = work_order_id
      and (w.contractor_id in (select public.my_contractor_ids())
           or w.assigned_user_id = auth.uid()
           or (public.has_permission('maintenance','view')
               and w.property_id in (select public.user_property_ids())))
  ));

create policy wo_items_write on public.work_order_items
  for insert to authenticated
  with check (exists (
    select 1 from public.work_orders w
    where w.id = work_order_id
      and w.status not in ('verified','cancelled')
      and (w.contractor_id in (select public.my_contractor_ids())
           or (public.has_permission('maintenance','update')
               and w.property_id in (select public.user_property_ids())))
  ));

create policy wo_items_update on public.work_order_items
  for update to authenticated
  using (exists (
    select 1 from public.work_orders w
    where w.id = work_order_id
      and w.status not in ('verified','cancelled')
      and (w.contractor_id in (select public.my_contractor_ids())
           or (public.has_permission('maintenance','update')
               and w.property_id in (select public.user_property_ids())))
  ))
  with check (exists (
    select 1 from public.work_orders w
    where w.id = work_order_id
      and w.status not in ('verified','cancelled')
      and (w.contractor_id in (select public.my_contractor_ids())
           or (public.has_permission('maintenance','update')
               and w.property_id in (select public.user_property_ids())))
  ));

-- -------------------------------------------------------------
-- maintenance_schedules — staff only
-- -------------------------------------------------------------
create policy schedules_read on public.maintenance_schedules
  for select to authenticated
  using (deleted_at is null and public.has_permission('maintenance','view')
         and property_id in (select public.user_property_ids()));

create policy schedules_insert on public.maintenance_schedules
  for insert to authenticated
  with check (public.has_permission('maintenance','create')
              and property_id in (select public.user_property_ids()));

create policy schedules_update on public.maintenance_schedules
  for update to authenticated
  using (public.has_permission('maintenance','update')
         and property_id in (select public.user_property_ids()))
  with check (public.has_permission('maintenance','update')
              and property_id in (select public.user_property_ids()));
