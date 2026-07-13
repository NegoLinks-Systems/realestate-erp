-- =============================================================
-- 00015: Phase 6 — Visitor, Vehicle & Parking
-- Tables: visitors, visitor_passes, visit_logs, vehicles,
--         parking_zones, parking_spaces, parking_allocations,
--         parking_fees
-- Logic:  check_in_pass()/check_out_pass() gate operations,
--         expire_visitor_passes() nightly, space status sync,
--         parking_billing_run() → Phase 3 invoices (idempotent)
-- =============================================================

create type public.pass_status as enum
  ('pending','checked_in','checked_out','expired','revoked');
create type public.space_type as enum ('resident','visitor','reserved');
create type public.space_status as enum ('available','allocated','blocked');

-- -------------------------------------------------------------
-- visitors & passes
-- -------------------------------------------------------------
create table public.visitors (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  phone       text,
  email       text,
  photo_path  text,

  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create trigger set_updated_at before update on public.visitors
for each row execute function public.tg_set_updated_at();

create table public.visitor_passes (
  id            uuid primary key default gen_random_uuid(),
  visitor_id    uuid not null references public.visitors(id),
  host_user_id  uuid not null references auth.users(id),
  property_id   uuid not null references public.properties(id),
  unit_id       uuid references public.units(id),
  purpose       text,
  valid_from    timestamptz not null default now(),
  valid_to      timestamptz not null,
  qr_token      uuid not null unique default gen_random_uuid(),
  status        public.pass_status not null default 'pending',
  revoked_reason text,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  check (valid_to > valid_from)
);
create trigger set_updated_at before update on public.visitor_passes
for each row execute function public.tg_set_updated_at();
create index idx_passes_property on public.visitor_passes (property_id, status) where deleted_at is null;
create index idx_passes_host on public.visitor_passes (host_user_id) where deleted_at is null;

create table public.visit_logs (
  id              uuid primary key default gen_random_uuid(),
  pass_id         uuid not null references public.visitor_passes(id),
  checked_in_at   timestamptz not null default now(),
  checked_in_by   uuid references auth.users(id),
  checked_out_at  timestamptz,
  checked_out_by  uuid references auth.users(id),
  gate_note       text,

  created_at      timestamptz not null default now()
);
create index idx_visit_logs_pass on public.visit_logs (pass_id);

-- -------------------------------------------------------------
-- vehicles & parking
-- -------------------------------------------------------------
create table public.vehicles (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  tenant_id   uuid references public.tenants(id),   -- null for staff vehicles
  owner_name  text not null,
  plate       text not null,
  model       text,
  color       text,
  sticker_no  text,

  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  unique (property_id, plate)
);
create trigger set_updated_at before update on public.vehicles
for each row execute function public.tg_set_updated_at();

create table public.parking_zones (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  name        text not null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  unique (property_id, name)
);
create trigger set_updated_at before update on public.parking_zones
for each row execute function public.tg_set_updated_at();

create table public.parking_spaces (
  id           uuid primary key default gen_random_uuid(),
  zone_id      uuid not null references public.parking_zones(id),
  space_number text not null,
  space_type   public.space_type not null default 'resident',
  status       public.space_status not null default 'available',

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  unique (zone_id, space_number)
);
create trigger set_updated_at before update on public.parking_spaces
for each row execute function public.tg_set_updated_at();

create table public.parking_allocations (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.parking_spaces(id),
  tenant_id    uuid references public.tenants(id),
  vehicle_id   uuid references public.vehicles(id),
  monthly_fee  numeric(14,2) not null default 0 check (monthly_fee >= 0),
  active       boolean not null default true,
  start_date   date not null default current_date,
  end_date     date,

  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create trigger set_updated_at before update on public.parking_allocations
for each row execute function public.tg_set_updated_at();

create unique index one_active_allocation_per_space
  on public.parking_allocations (space_id)
  where active and deleted_at is null;

create table public.parking_fees (
  id                  uuid primary key default gen_random_uuid(),
  property_id         uuid not null unique references public.properties(id),
  visitor_hourly_rate numeric(14,2) not null default 0,
  visitor_daily_cap   numeric(14,2),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger set_updated_at before update on public.parking_fees
for each row execute function public.tg_set_updated_at();

-- =============================================================
-- Space ↔ allocation status sync (mirrors the lease pattern)
-- =============================================================
create or replace function public.tg_allocation_space_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active and (tg_op = 'INSERT' or old.active is distinct from new.active) then
    update public.parking_spaces set status = 'allocated'
    where id = new.space_id and status = 'available';
  end if;

  if not new.active and (tg_op = 'UPDATE' and old.active) then
    update public.parking_spaces set status = 'available'
    where id = new.space_id and status = 'allocated';
  end if;
  return new;
end;
$$;

create trigger allocation_space_sync
after insert or update of active on public.parking_allocations
for each row execute function public.tg_allocation_space_sync();

-- =============================================================
-- Gate operations. Require visitors.update (security officers,
-- receptionists, managers) — tenants can create passes but not
-- operate the gate.
-- =============================================================
create or replace function public.check_in_pass(p_token uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pass public.visitor_passes%rowtype;
  v_log uuid;
begin
  if not public.has_permission('visitors','update') then
    raise exception 'visitors.update permission required to operate the gate';
  end if;

  select * into v_pass from public.visitor_passes
  where qr_token = p_token and deleted_at is null for update;
  if not found then raise exception 'Pass not found'; end if;

  if v_pass.property_id not in (select public.user_property_ids()) then
    raise exception 'Pass belongs to a property outside your assignment';
  end if;
  if v_pass.status not in ('pending') then
    raise exception 'Pass is % — cannot check in', v_pass.status;
  end if;
  if now() < v_pass.valid_from or now() > v_pass.valid_to then
    raise exception 'Pass is outside its validity window';
  end if;

  insert into public.visit_logs (pass_id, checked_in_by, gate_note)
  values (v_pass.id, auth.uid(), p_note)
  returning id into v_log;

  update public.visitor_passes set status = 'checked_in' where id = v_pass.id;

  insert into public.notifications (user_id, type, title, body, link)
  select v_pass.host_user_id, 'info', 'Your visitor has arrived',
         v.full_name || ' checked in at the gate',
         '/visitors/passes/' || v_pass.id
  from public.visitors v where v.id = v_pass.visitor_id;

  return v_log;
end;
$$;

create or replace function public.check_out_pass(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pass public.visitor_passes%rowtype;
begin
  if not public.has_permission('visitors','update') then
    raise exception 'visitors.update permission required to operate the gate';
  end if;

  select * into v_pass from public.visitor_passes
  where qr_token = p_token and deleted_at is null for update;
  if not found then raise exception 'Pass not found'; end if;
  if v_pass.status <> 'checked_in' then
    raise exception 'Pass is % — cannot check out', v_pass.status;
  end if;

  update public.visit_logs
  set checked_out_at = now(), checked_out_by = auth.uid()
  where pass_id = v_pass.id and checked_out_at is null;

  update public.visitor_passes set status = 'checked_out' where id = v_pass.id;
end;
$$;

-- Limited public lookup for the tokenized pass page (the visitor's
-- phone). Returns nothing sensitive; safe for the anon role via an
-- edge function.
create or replace function public.get_pass_by_token(p_token uuid)
returns table (visitor_name text, property_name text, valid_from timestamptz,
               valid_to timestamptz, status public.pass_status)
language sql
stable
security definer
set search_path = public
as $$
  select v.full_name, p.name, vp.valid_from, vp.valid_to, vp.status
  from public.visitor_passes vp
  join public.visitors v on v.id = vp.visitor_id
  join public.properties p on p.id = vp.property_id
  where vp.qr_token = p_token and vp.deleted_at is null;
$$;

-- Nightly: flip stale passes to expired.
create or replace function public.expire_visitor_passes()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v int;
begin
  update public.visitor_passes
  set status = 'expired'
  where status in ('pending','checked_in')
    and valid_to < now()
    and deleted_at is null;
  get diagnostics v = row_count;
  return v;
end;
$$;

-- =============================================================
-- parking_billing_run(): one parking invoice line per active
-- paid allocation per calendar month. Idempotent via
-- invoice_lines.source_ref = 'parking:<allocation>:<YYYY-MM>'.
-- =============================================================
create or replace function public.parking_billing_run()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  v_ref text;
  v_invoice uuid;
  v_property uuid;
  v_created int := 0;
begin
  for a in
    select pa.*, z.property_id
    from public.parking_allocations pa
    join public.parking_spaces s on s.id = pa.space_id
    join public.parking_zones z on z.id = s.zone_id
    where pa.active and pa.deleted_at is null
      and pa.tenant_id is not null
      and pa.monthly_fee > 0
      and pa.start_date <= current_date
      and (pa.end_date is null or pa.end_date >= current_date)
  loop
    v_ref := 'parking:' || a.id || ':' || to_char(current_date, 'YYYY-MM');

    if exists (select 1 from public.invoice_lines where source_ref = v_ref) then
      continue;
    end if;

    insert into public.invoices
      (tenant_id, property_id, due_date,
       period_start, period_end, created_by)
    values
      (a.tenant_id, a.property_id, current_date,
       date_trunc('month', current_date)::date,
       (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
       a.created_by)
    returning id into v_invoice;

    insert into public.invoice_lines
      (invoice_id, line_type, description, amount, source_ref)
    values
      (v_invoice, 'parking',
       'Parking ' || to_char(current_date, 'Mon YYYY'),
       a.monthly_fee, v_ref);

    perform public.refresh_invoice_status(v_invoice);
    v_created := v_created + 1;
  end loop;
  return v_created;
end;
$$;
