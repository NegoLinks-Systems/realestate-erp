-- =============================================================
-- 00011: Phase 4 — Maintenance Management
-- Tables: maintenance_requests, contractors, work_orders,
--         work_order_items, maintenance_schedules
-- Logic:  work-order cost rollup, verified work order → expense,
--         materialize_maintenance_schedules() for the nightly job
-- =============================================================

create type public.maintenance_category as enum
  ('plumbing','electrical','hvac','structural','cleaning','security','other');
create type public.request_priority as enum ('low','medium','high','urgent');
create type public.request_status as enum ('new','acknowledged','converted','rejected');
create type public.work_order_status as enum
  ('open','in_progress','on_hold','completed','verified','cancelled');

-- -------------------------------------------------------------
-- maintenance_requests — raised by a tenant (portal) or staff
-- -------------------------------------------------------------
create table public.maintenance_requests (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties(id),
  unit_id       uuid references public.units(id),
  tenant_id     uuid references public.tenants(id),   -- null when staff-raised
  category      public.maintenance_category not null default 'other',
  priority      public.request_priority not null default 'medium',
  title         text not null,
  description   text,
  photos        jsonb not null default '[]',           -- storage paths
  status        public.request_status not null default 'new',
  rejected_reason text,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger set_updated_at before update on public.maintenance_requests
for each row execute function public.tg_set_updated_at();
create index idx_requests_property on public.maintenance_requests (property_id, status) where deleted_at is null;
create index idx_requests_tenant on public.maintenance_requests (tenant_id) where deleted_at is null;

-- -------------------------------------------------------------
-- contractors — external service providers; user_id links a
-- portal login when the contractor has one
-- -------------------------------------------------------------
create table public.contractors (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id),
  company_name  text not null,
  contact_person text,
  phone         text,
  email         text,
  trades        jsonb not null default '[]',           -- ["plumbing","electrical"]
  rating        numeric(2,1) check (rating between 0 and 5),
  notes         text,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger set_updated_at before update on public.contractors
for each row execute function public.tg_set_updated_at();
create index idx_contractors_user on public.contractors (user_id) where deleted_at is null;

-- -------------------------------------------------------------
-- work_orders
-- -------------------------------------------------------------
create table public.work_orders (
  id               uuid primary key default gen_random_uuid(),
  request_id       uuid references public.maintenance_requests(id),
  property_id      uuid not null references public.properties(id),
  unit_id          uuid references public.units(id),
  title            text not null,
  description      text,
  assigned_user_id uuid references auth.users(id),     -- internal staff
  contractor_id    uuid references public.contractors(id),
  scheduled_date   date,
  status           public.work_order_status not null default 'open',
  completion_notes text,
  completion_photos jsonb not null default '[]',
  completed_at     timestamptz,
  verified_by      uuid references auth.users(id),
  verified_at      timestamptz,
  total_cost       numeric(14,2) not null default 0,

  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create trigger set_updated_at before update on public.work_orders
for each row execute function public.tg_set_updated_at();
create index idx_wo_property on public.work_orders (property_id, status) where deleted_at is null;
create index idx_wo_contractor on public.work_orders (contractor_id) where deleted_at is null;

create table public.work_order_items (
  id             uuid primary key default gen_random_uuid(),
  work_order_id  uuid not null references public.work_orders(id),
  item_type      text not null check (item_type in ('labor','parts','other')),
  description    text not null,
  quantity       numeric(10,2) not null default 1 check (quantity > 0),
  unit_cost      numeric(14,2) not null check (unit_cost >= 0),

  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index idx_wo_items_wo on public.work_order_items (work_order_id) where deleted_at is null;

-- -------------------------------------------------------------
-- maintenance_schedules — preventive recurring work
-- -------------------------------------------------------------
create table public.maintenance_schedules (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references public.properties(id),
  title          text not null,
  description    text,
  category       public.maintenance_category not null default 'other',
  recurrence_months int not null check (recurrence_months between 1 and 60),
  next_run       date not null,
  contractor_id  uuid references public.contractors(id),
  active         boolean not null default true,

  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create trigger set_updated_at before update on public.maintenance_schedules
for each row execute function public.tg_set_updated_at();

-- Link verified maintenance costs into Phase 3 finance
alter table public.expenses
  add column work_order_id uuid references public.work_orders(id);
create unique index one_expense_per_work_order
  on public.expenses (work_order_id) where work_order_id is not null;

-- =============================================================
-- Cost rollup: keep work_orders.total_cost = sum of live items
-- =============================================================
create or replace function public.tg_work_order_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wo uuid := coalesce(new.work_order_id, old.work_order_id);
begin
  update public.work_orders
  set total_cost = (
    select coalesce(sum(quantity * unit_cost), 0)
    from public.work_order_items
    where work_order_id = v_wo and deleted_at is null
  )
  where id = v_wo;
  return coalesce(new, old);
end;
$$;

create trigger work_order_cost_rollup
after insert or update or delete on public.work_order_items
for each row execute function public.tg_work_order_cost();

-- =============================================================
-- Verified work order → verified_at stamp (BEFORE) and expense
-- posting (AFTER, so it only happens when the update succeeded).
-- The partial unique index requires the conflict target to repeat
-- its predicate.
-- =============================================================
create or replace function public.tg_work_order_verified_stamp()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'verified' and old.status is distinct from 'verified' then
    new.verified_at := coalesce(new.verified_at, now());
    new.verified_by := coalesce(new.verified_by, auth.uid());
  end if;
  return new;
end;
$$;

create trigger work_order_verified_stamp
before update of status on public.work_orders
for each row execute function public.tg_work_order_verified_stamp();

create or replace function public.tg_work_order_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'verified' and old.status is distinct from 'verified'
     and new.total_cost > 0 then
    insert into public.expenses
      (property_id, category_id, description, amount, incurred_at,
       work_order_id, created_by)
    values
      (new.property_id,
       (select id from public.expense_categories where name = 'maintenance'),
       'Work order: ' || new.title,
       new.total_cost,
       coalesce(new.completed_at::date, current_date),
       new.id,
       auth.uid())
    on conflict (work_order_id) where work_order_id is not null do nothing;
  end if;
  return new;
end;
$$;

create trigger work_order_expense
after update of status on public.work_orders
for each row execute function public.tg_work_order_expense();

-- =============================================================
-- materialize_maintenance_schedules() — nightly job. Creates a
-- work order for each due schedule and advances next_run, so
-- re-running the same day creates nothing new.
-- =============================================================
create or replace function public.materialize_maintenance_schedules()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  v_created int := 0;
begin
  for s in
    select * from public.maintenance_schedules
    where active and deleted_at is null and next_run <= current_date
  loop
    insert into public.work_orders
      (property_id, title, description, contractor_id,
       scheduled_date, status, created_by)
    values
      (s.property_id,
       s.title || ' (' || to_char(s.next_run, 'YYYY-MM-DD') || ')',
       s.description, s.contractor_id, s.next_run, 'open', s.created_by);

    update public.maintenance_schedules
    set next_run = s.next_run + (s.recurrence_months || ' months')::interval
    where id = s.id;

    v_created := v_created + 1;
  end loop;
  return v_created;
end;
$$;
