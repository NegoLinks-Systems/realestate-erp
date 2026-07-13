-- =============================================================
-- 00017: Phase 7 — Procurement & Inventory
-- Tables: vendors, warehouses, inventory_items, stock_levels,
--         stock_movements, purchase_requisitions (+lines),
--         purchase_orders (+lines), goods_receipts
-- Logic:  stock_levels maintained ONLY from the stock_movements
--         ledger (trigger), negative stock impossible;
--         approve_requisition() (separation of duties),
--         receive_goods() partial receipts, 
--         issue_stock_to_work_order() → Phase 4 cost items,
--         low_stock_items() for the nightly job
-- =============================================================

create type public.requisition_status as enum ('draft','submitted','approved','rejected');
create type public.po_status as enum
  ('draft','issued','partially_received','received','closed','cancelled');
create type public.movement_type as enum
  ('receipt','issue','transfer_in','transfer_out','adjustment');

create sequence public.po_number_seq;

-- -------------------------------------------------------------
create table public.vendors (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id),      -- vendor portal login
  company_name  text not null,
  categories    jsonb not null default '[]',
  contact_person text,
  phone         text,
  email         text,
  bank_details  jsonb not null default '{}',
  notes         text,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger set_updated_at before update on public.vendors
for each row execute function public.tg_set_updated_at();

create table public.warehouses (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid references public.properties(id),  -- null = central store
  name          text not null unique,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger set_updated_at before update on public.warehouses
for each row execute function public.tg_set_updated_at();

create table public.inventory_items (
  id            uuid primary key default gen_random_uuid(),
  sku           text not null unique,
  name          text not null,
  unit          text not null default 'pcs',
  reorder_level numeric(12,2) not null default 0,
  default_cost  numeric(14,2) not null default 0 check (default_cost >= 0),

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger set_updated_at before update on public.inventory_items
for each row execute function public.tg_set_updated_at();

-- stock_levels: derived cache. Never written by clients; the
-- movements trigger is the only writer.
create table public.stock_levels (
  item_id      uuid not null references public.inventory_items(id),
  warehouse_id uuid not null references public.warehouses(id),
  quantity     numeric(12,2) not null default 0 check (quantity >= 0),
  updated_at   timestamptz not null default now(),
  primary key (item_id, warehouse_id)
);

create table public.stock_movements (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.inventory_items(id),
  warehouse_id   uuid not null references public.warehouses(id),
  movement_type  public.movement_type not null,
  quantity       numeric(12,2) not null,
  unit_cost      numeric(14,2),
  reference_type text,                     -- 'po' | 'work_order' | 'manual' ...
  reference_id   uuid,
  note           text,

  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),

  -- quantity must be positive except signed adjustments
  check (movement_type = 'adjustment' or quantity > 0)
);
create index idx_movements_item on public.stock_movements (item_id, warehouse_id, created_at desc);

-- -------------------------------------------------------------
-- requisitions & purchase orders
-- -------------------------------------------------------------
create table public.purchase_requisitions (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid references public.properties(id),
  requested_by  uuid not null references auth.users(id),
  status        public.requisition_status not null default 'draft',
  notes         text,
  decided_by    uuid references auth.users(id),
  decided_at    timestamptz,
  rejection_reason text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger set_updated_at before update on public.purchase_requisitions
for each row execute function public.tg_set_updated_at();

create table public.requisition_lines (
  id             uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references public.purchase_requisitions(id),
  item_id        uuid references public.inventory_items(id),
  description    text not null,
  quantity       numeric(12,2) not null check (quantity > 0),
  est_unit_cost  numeric(14,2) not null default 0,

  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table public.purchase_orders (
  id             uuid primary key default gen_random_uuid(),
  po_number      text not null unique
                 default 'PO-' || lpad(nextval('public.po_number_seq')::text, 6, '0'),
  vendor_id      uuid not null references public.vendors(id),
  requisition_id uuid references public.purchase_requisitions(id),
  warehouse_id   uuid not null references public.warehouses(id),
  property_id    uuid references public.properties(id),
  status         public.po_status not null default 'draft',
  notes          text,

  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create trigger set_updated_at before update on public.purchase_orders
for each row execute function public.tg_set_updated_at();
create index idx_po_vendor on public.purchase_orders (vendor_id) where deleted_at is null;

create table public.po_lines (
  id           uuid primary key default gen_random_uuid(),
  po_id        uuid not null references public.purchase_orders(id),
  item_id      uuid references public.inventory_items(id),
  description  text not null,
  quantity     numeric(12,2) not null check (quantity > 0),
  unit_cost    numeric(14,2) not null check (unit_cost >= 0),
  received_qty numeric(12,2) not null default 0 check (received_qty >= 0),

  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  check (received_qty <= quantity)
);

create table public.goods_receipts (
  id           uuid primary key default gen_random_uuid(),
  po_id        uuid not null references public.purchase_orders(id),
  received_by  uuid references auth.users(id),
  received_at  timestamptz not null default now(),
  lines        jsonb not null default '[]',   -- [{po_line_id, quantity}] as recorded
  note         text,

  created_at   timestamptz not null default now()
);

-- =============================================================
-- Stock ledger trigger: the ONLY writer of stock_levels.
-- Raises on any movement that would take stock negative.
-- =============================================================
create or replace function public.tg_apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta numeric(12,2);
  v_new numeric(12,2);
begin
  v_delta := case new.movement_type
    when 'receipt' then new.quantity
    when 'transfer_in' then new.quantity
    when 'issue' then -new.quantity
    when 'transfer_out' then -new.quantity
    when 'adjustment' then new.quantity       -- signed
  end;

  insert into public.stock_levels (item_id, warehouse_id, quantity, updated_at)
  values (new.item_id, new.warehouse_id, greatest(v_delta, 0), now())
  on conflict (item_id, warehouse_id)
  do update set quantity = public.stock_levels.quantity + v_delta,
                updated_at = now()
  returning quantity into v_new;

  if v_new < 0 or (v_delta < 0 and v_new is null) then
    raise exception 'Insufficient stock: movement would take item below zero';
  end if;

  return new;
end;
$$;

create trigger apply_stock_movement
after insert on public.stock_movements
for each row execute function public.tg_apply_stock_movement();

-- Movements are immutable ledger entries: corrections are new
-- adjustment rows, never edits.
create or replace function public.tg_forbid_movement_edit()
returns trigger language plpgsql as $$
begin
  raise exception 'Stock movements are immutable; post an adjustment instead';
end;
$$;
create trigger forbid_movement_edit
before update or delete on public.stock_movements
for each row execute function public.tg_forbid_movement_edit();

-- =============================================================
-- Requisition approval — separation of duties: requires
-- procurement.approve (accountants/managers), which the
-- procurement_officer role deliberately does not hold.
-- =============================================================
create or replace function public.approve_requisition(p_id uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.purchase_requisitions%rowtype;
begin
  if not public.has_permission('procurement','approve') then
    raise exception 'procurement.approve permission required';
  end if;

  select * into v_req from public.purchase_requisitions
  where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Requisition not found'; end if;
  if v_req.status <> 'submitted' then
    raise exception 'Requisition is % — only submitted requisitions can be decided', v_req.status;
  end if;
  if v_req.requested_by = auth.uid() then
    raise exception 'You cannot approve your own requisition';
  end if;

  update public.purchase_requisitions
  set status = case when p_approve then 'approved'::public.requisition_status
                    else 'rejected'::public.requisition_status end,
      decided_by = auth.uid(),
      decided_at = now(),
      rejection_reason = case when p_approve then null else p_reason end
  where id = p_id;
end;
$$;

-- =============================================================
-- receive_goods(): partial receipt against a PO. Updates
-- po_lines.received_qty, posts receipt movements, records the
-- goods_receipt, and rolls the PO status forward.
-- p_lines: [{"po_line_id": "...", "quantity": 6}]
-- =============================================================
create or replace function public.receive_goods(p_po_id uuid, p_lines jsonb, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po public.purchase_orders%rowtype;
  l record;
  v_line public.po_lines%rowtype;
  v_receipt uuid;
  v_outstanding numeric;
begin
  if not public.has_permission('procurement','update') then
    raise exception 'procurement.update permission required';
  end if;

  select * into v_po from public.purchase_orders
  where id = p_po_id and deleted_at is null for update;
  if not found then raise exception 'Purchase order not found'; end if;
  if v_po.status not in ('issued','partially_received') then
    raise exception 'PO is % — cannot receive against it', v_po.status;
  end if;

  insert into public.goods_receipts (po_id, received_by, lines, note)
  values (p_po_id, auth.uid(), p_lines, p_note)
  returning id into v_receipt;

  for l in select (x->>'po_line_id')::uuid as po_line_id,
                  (x->>'quantity')::numeric as quantity
           from jsonb_array_elements(p_lines) x
  loop
    if l.quantity is null or l.quantity <= 0 then
      raise exception 'Receipt quantity must be positive';
    end if;

    select * into v_line from public.po_lines
    where id = l.po_line_id and po_id = p_po_id and deleted_at is null for update;
    if not found then raise exception 'PO line % not on this PO', l.po_line_id; end if;

    if v_line.received_qty + l.quantity > v_line.quantity then
      raise exception 'Over-receipt on %: % ordered, % already received, % attempted',
        v_line.description, v_line.quantity, v_line.received_qty, l.quantity;
    end if;

    update public.po_lines
    set received_qty = received_qty + l.quantity
    where id = v_line.id;

    if v_line.item_id is not null then
      insert into public.stock_movements
        (item_id, warehouse_id, movement_type, quantity, unit_cost,
         reference_type, reference_id, created_by)
      values
        (v_line.item_id, v_po.warehouse_id, 'receipt', l.quantity,
         v_line.unit_cost, 'po', p_po_id, auth.uid());
    end if;
  end loop;

  update public.purchase_orders
  set status = case
    when not exists (select 1 from public.po_lines
                     where po_id = p_po_id and deleted_at is null
                       and received_qty < quantity)
      then 'received'::public.po_status
    else 'partially_received'::public.po_status
  end
  where id = p_po_id;

  return v_receipt;
end;
$$;

-- =============================================================
-- issue_stock_to_work_order(): consumes stock and adds a parts
-- cost line to the work order (Phase 4 rollup then reprices it).
-- =============================================================
create or replace function public.issue_stock_to_work_order(
  p_work_order_id uuid, p_item_id uuid, p_warehouse_id uuid, p_quantity numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wo public.work_orders%rowtype;
  v_item public.inventory_items%rowtype;
begin
  if not (public.has_permission('procurement','update')
          or public.has_permission('maintenance','update')) then
    raise exception 'procurement.update or maintenance.update required';
  end if;

  select * into v_wo from public.work_orders
  where id = p_work_order_id and deleted_at is null;
  if not found then raise exception 'Work order not found'; end if;
  if v_wo.status in ('verified','cancelled') then
    raise exception 'Work order is % — cannot issue stock to it', v_wo.status;
  end if;

  select * into v_item from public.inventory_items
  where id = p_item_id and deleted_at is null;
  if not found then raise exception 'Item not found'; end if;

  -- ledger entry (trigger enforces sufficient stock)
  insert into public.stock_movements
    (item_id, warehouse_id, movement_type, quantity, unit_cost,
     reference_type, reference_id, created_by)
  values
    (p_item_id, p_warehouse_id, 'issue', p_quantity,
     v_item.default_cost, 'work_order', p_work_order_id, auth.uid());

  insert into public.work_order_items
    (work_order_id, item_type, description, quantity, unit_cost, created_by)
  values
    (p_work_order_id, 'parts', v_item.name || ' (' || v_item.sku || ')',
     p_quantity, v_item.default_cost, auth.uid());
end;
$$;

-- Items at or below reorder level (for nightly notifications)
create or replace function public.low_stock_items()
returns table (item_id uuid, sku text, name text,
               total_quantity numeric, reorder_level numeric)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.sku, i.name,
         coalesce(sum(s.quantity), 0), i.reorder_level
  from public.inventory_items i
  left join public.stock_levels s on s.item_id = i.id
  where i.deleted_at is null and i.reorder_level > 0
  group by i.id
  having coalesce(sum(s.quantity), 0) <= i.reorder_level;
$$;
