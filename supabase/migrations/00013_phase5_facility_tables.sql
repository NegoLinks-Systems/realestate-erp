-- =============================================================
-- 00013: Phase 5 — Facility & Asset Management
-- Tables: assets, asset_service_history, operational_schedules,
--         operational_logs, inspection_templates, inspections,
--         inspection_items
-- Logic:  verified asset work order → service history (once) +
--         last_serviced_at; inspection score rollup
-- =============================================================

create type public.asset_category as enum
  ('generator','lift','pump','hvac','electrical','plumbing','fire_safety','other');
create type public.asset_status as enum
  ('operational','faulty','under_repair','decommissioned','disposed');
create type public.operation_type as enum
  ('cleaning','security','waste','landscaping','other');
create type public.inspection_status as enum ('draft','in_progress','completed');

-- -------------------------------------------------------------
-- assets
-- -------------------------------------------------------------
create table public.assets (
  id               uuid primary key default gen_random_uuid(),
  property_id      uuid not null references public.properties(id),
  category         public.asset_category not null default 'other',
  name             text not null,
  serial_number    text,
  location_note    text,                      -- "Basement plant room"
  purchase_date    date,
  purchase_cost    numeric(14,2) check (purchase_cost >= 0),
  warranty_expiry  date,
  status           public.asset_status not null default 'operational',
  last_serviced_at date,

  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create trigger set_updated_at before update on public.assets
for each row execute function public.tg_set_updated_at();
create index idx_assets_property on public.assets (property_id, status) where deleted_at is null;

-- Link maintenance to assets
alter table public.work_orders add column asset_id uuid references public.assets(id);
alter table public.maintenance_schedules add column asset_id uuid references public.assets(id);

create table public.asset_service_history (
  id             uuid primary key default gen_random_uuid(),
  asset_id       uuid not null references public.assets(id),
  work_order_id  uuid not null unique references public.work_orders(id),
  serviced_at    date not null,
  cost           numeric(14,2) not null default 0,
  summary        text,

  created_at     timestamptz not null default now()
);
create index idx_service_history_asset on public.asset_service_history (asset_id, serviced_at desc);

-- -------------------------------------------------------------
-- operational schedules & logs (cleaning, security, waste, ...)
-- Logs are entered by staff against a schedule; no auto-
-- materialization needed here.
-- -------------------------------------------------------------
create table public.operational_schedules (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties(id),
  op_type       public.operation_type not null,
  title         text not null,
  description   text,
  frequency     text,                          -- human-readable ("Daily 6am", "Mon/Wed/Fri")
  assigned_note text,                          -- team or vendor
  active        boolean not null default true,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger set_updated_at before update on public.operational_schedules
for each row execute function public.tg_set_updated_at();

create table public.operational_logs (
  id            uuid primary key default gen_random_uuid(),
  schedule_id   uuid not null references public.operational_schedules(id),
  performed_at  timestamptz not null default now(),
  performed_by  uuid references auth.users(id),
  notes         text,
  photos        jsonb not null default '[]',

  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index idx_op_logs_schedule on public.operational_logs (schedule_id, performed_at desc);

-- -------------------------------------------------------------
-- inspections
-- -------------------------------------------------------------
create table public.inspection_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  items         jsonb not null default '[]',   -- [{"label":"Fire extinguishers charged","category":"fire_safety"}]
  active        boolean not null default true,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger set_updated_at before update on public.inspection_templates
for each row execute function public.tg_set_updated_at();

create table public.inspections (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid references public.inspection_templates(id),
  property_id   uuid not null references public.properties(id),
  title         text not null,
  inspector_id  uuid references auth.users(id),
  status        public.inspection_status not null default 'draft',
  overall_score numeric(3,1),                  -- avg of item scores, 0–5
  notes         text,
  completed_at  timestamptz,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger set_updated_at before update on public.inspections
for each row execute function public.tg_set_updated_at();
create index idx_inspections_property on public.inspections (property_id, created_at desc) where deleted_at is null;

create table public.inspection_items (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id),
  label         text not null,
  category      text,
  score         int check (score between 0 and 5),  -- null until inspected
  comment       text,
  photos        jsonb not null default '[]',

  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index idx_inspection_items_inspection on public.inspection_items (inspection_id);

-- =============================================================
-- Inspection score rollup: overall_score = avg of scored items
-- =============================================================
create or replace function public.tg_inspection_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inspection uuid := coalesce(new.inspection_id, old.inspection_id);
begin
  update public.inspections
  set overall_score = (
    select round(avg(score)::numeric, 1)
    from public.inspection_items
    where inspection_id = v_inspection
      and score is not null and deleted_at is null
  )
  where id = v_inspection;
  return coalesce(new, old);
end;
$$;

create trigger inspection_score_rollup
after insert or update or delete on public.inspection_items
for each row execute function public.tg_inspection_score();

-- =============================================================
-- Verified asset work order → service history (exactly once,
-- via the unique work_order_id) + last_serviced_at on the asset.
-- Runs alongside the Phase 4 expense trigger.
-- =============================================================
create or replace function public.tg_asset_service_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'verified' and old.status is distinct from 'verified'
     and new.asset_id is not null then
    insert into public.asset_service_history
      (asset_id, work_order_id, serviced_at, cost, summary)
    values
      (new.asset_id, new.id,
       coalesce(new.completed_at::date, current_date),
       new.total_cost, new.title)
    on conflict (work_order_id) do nothing;

    update public.assets
    set last_serviced_at = coalesce(new.completed_at::date, current_date),
        status = case when status = 'under_repair'
                      then 'operational'::public.asset_status
                      else status end
    where id = new.asset_id;
  end if;
  return new;
end;
$$;

create trigger asset_service_history_on_verify
after update of status on public.work_orders
for each row execute function public.tg_asset_service_history();
