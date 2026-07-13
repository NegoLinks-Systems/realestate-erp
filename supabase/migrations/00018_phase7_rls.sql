-- =============================================================
-- 00018: Phase 7 — Procurement & Inventory RLS
-- Staff via procurement.*; vendors read only their own POs;
-- stock_levels and stock_movements have no client write policies
-- (ledger written by functions/trigger only, movements immutable).
-- =============================================================

create or replace function public.my_vendor_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select id from public.vendors
  where user_id = auth.uid() and deleted_at is null;
$$;

alter table public.vendors               enable row level security;
alter table public.warehouses            enable row level security;
alter table public.inventory_items       enable row level security;
alter table public.stock_levels          enable row level security;
alter table public.stock_movements       enable row level security;
alter table public.purchase_requisitions enable row level security;
alter table public.requisition_lines     enable row level security;
alter table public.purchase_orders       enable row level security;
alter table public.po_lines              enable row level security;
alter table public.goods_receipts        enable row level security;

create policy vendors_read_own on public.vendors
  for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);
create policy vendors_read_staff on public.vendors
  for select to authenticated
  using (deleted_at is null and public.has_permission('procurement','view')
         and not has_role('vendor') or public.is_admin());
create policy vendors_insert on public.vendors
  for insert to authenticated
  with check (public.has_permission('procurement','update'));
create policy vendors_update on public.vendors
  for update to authenticated
  using (public.has_permission('procurement','update'))
  with check (public.has_permission('procurement','update'));

create policy warehouses_read on public.warehouses
  for select to authenticated
  using (deleted_at is null and (public.has_permission('procurement','view')
         or public.has_permission('inventory','view')));
create policy warehouses_write on public.warehouses
  for insert to authenticated
  with check (public.has_permission('inventory','update'));
create policy warehouses_update on public.warehouses
  for update to authenticated
  using (public.has_permission('inventory','update'))
  with check (public.has_permission('inventory','update'));

create policy items_read on public.inventory_items
  for select to authenticated
  using (deleted_at is null and (public.has_permission('inventory','view')
         or public.has_permission('maintenance','update')));
create policy items_write on public.inventory_items
  for insert to authenticated
  with check (public.has_permission('inventory','create'));
create policy items_update on public.inventory_items
  for update to authenticated
  using (public.has_permission('inventory','update'))
  with check (public.has_permission('inventory','update'));

-- stock: read-only to clients; the ledger trigger is the writer
create policy stock_read on public.stock_levels
  for select to authenticated
  using (public.has_permission('inventory','view'));

create policy movements_read on public.stock_movements
  for select to authenticated
  using (public.has_permission('inventory','view'));
-- Direct manual adjustments only, with inventory.update; receipts
-- and issues come through the security-definer functions.
create policy movements_insert_adjustment on public.stock_movements
  for insert to authenticated
  with check (movement_type = 'adjustment'
              and public.has_permission('inventory','update'));

create policy requisitions_read on public.purchase_requisitions
  for select to authenticated
  using (deleted_at is null and (
    requested_by = auth.uid()
    or (public.has_permission('procurement','view') and not has_role('vendor'))
    or public.is_admin()
  ));
create policy requisitions_insert on public.purchase_requisitions
  for insert to authenticated
  with check (requested_by = auth.uid()
              and public.has_permission('procurement','create'));
-- Owners edit their drafts and submit; decisions go through
-- approve_requisition() (status pinned by with check).
create policy requisitions_update_own on public.purchase_requisitions
  for update to authenticated
  using (requested_by = auth.uid() and status in ('draft','submitted'))
  with check (requested_by = auth.uid() and status in ('draft','submitted'));
create policy requisitions_update_staff on public.purchase_requisitions
  for update to authenticated
  using (public.has_permission('procurement','update'))
  with check (public.has_permission('procurement','update')
              and status in ('draft','submitted'));

create policy req_lines_read on public.requisition_lines
  for select to authenticated
  using (deleted_at is null and exists (
    select 1 from public.purchase_requisitions r
    where r.id = requisition_id
      and (r.requested_by = auth.uid()
           or (public.has_permission('procurement','view') and not has_role('vendor'))
           or public.is_admin())));
create policy req_lines_write on public.requisition_lines
  for insert to authenticated
  with check (exists (
    select 1 from public.purchase_requisitions r
    where r.id = requisition_id
      and r.status = 'draft'
      and (r.requested_by = auth.uid()
           or public.has_permission('procurement','update'))));

create policy po_read on public.purchase_orders
  for select to authenticated
  using (deleted_at is null and (
    vendor_id in (select public.my_vendor_ids())
    or (public.has_permission('procurement','view') and not has_role('vendor'))
    or public.is_admin()
  ));
create policy po_insert on public.purchase_orders
  for insert to authenticated
  with check (public.has_permission('procurement','create'));
create policy po_update on public.purchase_orders
  for update to authenticated
  using (public.has_permission('procurement','update'))
  with check (public.has_permission('procurement','update'));

create policy po_lines_read on public.po_lines
  for select to authenticated
  using (deleted_at is null and exists (
    select 1 from public.purchase_orders p
    where p.id = po_id
      and (p.vendor_id in (select public.my_vendor_ids())
           or (public.has_permission('procurement','view') and not has_role('vendor'))
           or public.is_admin())));
create policy po_lines_write on public.po_lines
  for insert to authenticated
  with check (exists (
    select 1 from public.purchase_orders p
    where p.id = po_id and p.status = 'draft'
      and public.has_permission('procurement','update')));
create policy po_lines_update on public.po_lines
  for update to authenticated
  using (public.has_permission('procurement','update'))
  with check (public.has_permission('procurement','update'));

create policy receipts_read on public.goods_receipts
  for select to authenticated
  using ((public.has_permission('procurement','view') and not has_role('vendor'))
         or public.is_admin());
-- No insert policy: receipts are written by receive_goods() only.
