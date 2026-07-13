-- =============================================================
-- 00014: Phase 5 — Facility RLS
-- facilities.* permission + property scope throughout.
-- Contractors, tenants, landlords get no facility access.
-- =============================================================

alter table public.assets                enable row level security;
alter table public.asset_service_history enable row level security;
alter table public.operational_schedules enable row level security;
alter table public.operational_logs      enable row level security;
alter table public.inspection_templates  enable row level security;
alter table public.inspections           enable row level security;
alter table public.inspection_items      enable row level security;

create policy assets_read on public.assets
  for select to authenticated
  using (deleted_at is null and public.has_permission('facilities','view')
         and property_id in (select public.user_property_ids()));
create policy assets_insert on public.assets
  for insert to authenticated
  with check (public.has_permission('facilities','create')
              and property_id in (select public.user_property_ids()));
create policy assets_update on public.assets
  for update to authenticated
  using (public.has_permission('facilities','update')
         and property_id in (select public.user_property_ids()))
  with check (public.has_permission('facilities','update')
              and property_id in (select public.user_property_ids()));

create policy service_history_read on public.asset_service_history
  for select to authenticated
  using (exists (select 1 from public.assets a
                 where a.id = asset_id
                   and public.has_permission('facilities','view')
                   and a.property_id in (select public.user_property_ids())));
-- No insert/update policies: rows are written only by the
-- security-definer trigger on work order verification.

create policy op_schedules_read on public.operational_schedules
  for select to authenticated
  using (deleted_at is null and public.has_permission('facilities','view')
         and property_id in (select public.user_property_ids()));
create policy op_schedules_insert on public.operational_schedules
  for insert to authenticated
  with check (public.has_permission('facilities','create')
              and property_id in (select public.user_property_ids()));
create policy op_schedules_update on public.operational_schedules
  for update to authenticated
  using (public.has_permission('facilities','update')
         and property_id in (select public.user_property_ids()))
  with check (public.has_permission('facilities','update')
              and property_id in (select public.user_property_ids()));

create policy op_logs_read on public.operational_logs
  for select to authenticated
  using (deleted_at is null and exists (
    select 1 from public.operational_schedules s
    where s.id = schedule_id
      and public.has_permission('facilities','view')
      and s.property_id in (select public.user_property_ids())));
create policy op_logs_write on public.operational_logs
  for insert to authenticated
  with check (exists (
    select 1 from public.operational_schedules s
    where s.id = schedule_id
      and public.has_permission('facilities','update')
      and s.property_id in (select public.user_property_ids())));

create policy templates_read on public.inspection_templates
  for select to authenticated
  using (deleted_at is null and public.has_permission('facilities','view'));
create policy templates_write on public.inspection_templates
  for insert to authenticated
  with check (public.has_permission('facilities','create'));
create policy templates_update on public.inspection_templates
  for update to authenticated
  using (public.has_permission('facilities','update'))
  with check (public.has_permission('facilities','update'));

create policy inspections_read on public.inspections
  for select to authenticated
  using (deleted_at is null and public.has_permission('facilities','view')
         and property_id in (select public.user_property_ids()));
create policy inspections_insert on public.inspections
  for insert to authenticated
  with check (public.has_permission('facilities','create')
              and property_id in (select public.user_property_ids()));
create policy inspections_update on public.inspections
  for update to authenticated
  using (public.has_permission('facilities','update')
         and property_id in (select public.user_property_ids()))
  with check (public.has_permission('facilities','update')
              and property_id in (select public.user_property_ids()));

create policy inspection_items_read on public.inspection_items
  for select to authenticated
  using (deleted_at is null and exists (
    select 1 from public.inspections i
    where i.id = inspection_id
      and public.has_permission('facilities','view')
      and i.property_id in (select public.user_property_ids())));
create policy inspection_items_write on public.inspection_items
  for insert to authenticated
  with check (exists (
    select 1 from public.inspections i
    where i.id = inspection_id
      and i.status <> 'completed'
      and public.has_permission('facilities','update')
      and i.property_id in (select public.user_property_ids())));
create policy inspection_items_update on public.inspection_items
  for update to authenticated
  using (exists (
    select 1 from public.inspections i
    where i.id = inspection_id
      and i.status <> 'completed'
      and public.has_permission('facilities','update')
      and i.property_id in (select public.user_property_ids())))
  with check (exists (
    select 1 from public.inspections i
    where i.id = inspection_id
      and i.status <> 'completed'
      and public.has_permission('facilities','update')
      and i.property_id in (select public.user_property_ids())));
