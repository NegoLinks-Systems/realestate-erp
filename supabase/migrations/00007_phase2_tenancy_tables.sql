-- =============================================================
-- 00007: Phase 2 — Landlords, Tenants & Leases
-- Tables: landlords, ownership_records, tenants,
--         tenant_documents, leases, lease_documents,
--         security_deposits, rent_reviews, complaints, notices
-- Logic:  one-active-lease-per-unit, unit status sync,
--         lease_status_refresh() for the nightly job
-- =============================================================

create type public.party_kind    as enum ('individual','corporate');
create type public.lease_status  as enum ('draft','active','expiring','expired','terminated','renewed');
create type public.deposit_status as enum ('held','partially_refunded','refunded','forfeited');
create type public.complaint_status as enum ('open','in_progress','resolved','closed');

-- -------------------------------------------------------------
-- landlords (property owners). user_id links to a portal login
-- when the landlord has one; ownership itself lives in
-- ownership_records.
-- -------------------------------------------------------------
create table public.landlords (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id),
  kind          public.party_kind not null default 'individual',
  full_name     text not null,                 -- person or company name
  contact_person text,                         -- for corporate
  phone         text,
  email         text,
  address       text,
  bank_details  jsonb not null default '{}',   -- {"bank":"","account_name":"","account_no":""}
  notes         text,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger set_updated_at before update on public.landlords
for each row execute function public.tg_set_updated_at();
create index idx_landlords_user on public.landlords (user_id) where deleted_at is null;

create table public.ownership_records (
  id                uuid primary key default gen_random_uuid(),
  landlord_id       uuid not null references public.landlords(id),
  property_id       uuid not null references public.properties(id),
  unit_id           uuid references public.units(id),  -- null = whole property
  ownership_percent numeric(5,2) not null default 100
                    check (ownership_percent > 0 and ownership_percent <= 100),
  management_fee_percent numeric(5,2) not null default 0
                    check (management_fee_percent >= 0 and management_fee_percent < 100),
  start_date        date not null default current_date,
  end_date          date,

  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  check (end_date is null or end_date > start_date)
);
create trigger set_updated_at before update on public.ownership_records
for each row execute function public.tg_set_updated_at();
create index idx_ownership_landlord on public.ownership_records (landlord_id) where deleted_at is null;
create index idx_ownership_property on public.ownership_records (property_id) where deleted_at is null;

-- -------------------------------------------------------------
-- tenants. user_id links to the portal login.
-- -------------------------------------------------------------
create table public.tenants (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id),
  kind          public.party_kind not null default 'individual',
  full_name     text not null,
  contact_person text,
  phone         text,
  email         text,
  id_type       text,                          -- national id, passport, ... (varies by country)
  id_number     text,
  employer      text,
  emergency_contact jsonb not null default '{}',
  notes         text,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger set_updated_at before update on public.tenants
for each row execute function public.tg_set_updated_at();
create index idx_tenants_user on public.tenants (user_id) where deleted_at is null;

create table public.tenant_documents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id),
  title         text not null,
  category      text not null default 'other'
                check (category in ('id','reference','guarantor','contract','other')),
  storage_path  text not null,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger set_updated_at before update on public.tenant_documents
for each row execute function public.tg_set_updated_at();

-- -------------------------------------------------------------
-- leases — the contract binding tenant ↔ unit.
-- renewed_from links a renewal to its predecessor.
-- -------------------------------------------------------------
create table public.leases (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.units(id),
  tenant_id       uuid not null references public.tenants(id),
  status          public.lease_status not null default 'draft',
  start_date      date not null,
  end_date        date not null,
  rent_amount     numeric(14,2) not null check (rent_amount >= 0),
  rent_frequency  text not null default 'annual'
                  check (rent_frequency in ('monthly','quarterly','biannual','annual')),
  service_charge  numeric(14,2) not null default 0 check (service_charge >= 0),
  deposit_amount  numeric(14,2) not null default 0 check (deposit_amount >= 0),
  agreement_path  text,                        -- signed agreement in Storage
  renewed_from    uuid references public.leases(id),
  terminated_at   timestamptz,
  termination_reason text,

  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  check (end_date > start_date)
);
create trigger set_updated_at before update on public.leases
for each row execute function public.tg_set_updated_at();
create index idx_leases_unit   on public.leases (unit_id) where deleted_at is null;
create index idx_leases_tenant on public.leases (tenant_id) where deleted_at is null;
create index idx_leases_status on public.leases (status) where deleted_at is null;

-- THE core integrity rule: at most one live lease per unit.
create unique index one_live_lease_per_unit
  on public.leases (unit_id)
  where status in ('active','expiring') and deleted_at is null;

create table public.lease_documents (
  id            uuid primary key default gen_random_uuid(),
  lease_id      uuid not null references public.leases(id),
  title         text not null,
  storage_path  text not null,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger set_updated_at before update on public.lease_documents
for each row execute function public.tg_set_updated_at();

create table public.security_deposits (
  id            uuid primary key default gen_random_uuid(),
  lease_id      uuid not null references public.leases(id),
  amount        numeric(14,2) not null check (amount >= 0),
  status        public.deposit_status not null default 'held',
  refunded_amount numeric(14,2) not null default 0 check (refunded_amount >= 0),
  notes         text,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  check (refunded_amount <= amount)
);
create trigger set_updated_at before update on public.security_deposits
for each row execute function public.tg_set_updated_at();

create table public.rent_reviews (
  id            uuid primary key default gen_random_uuid(),
  lease_id      uuid not null references public.leases(id),
  review_date   date not null,
  old_rent      numeric(14,2) not null,
  proposed_rent numeric(14,2) not null,
  status        text not null default 'proposed'
                check (status in ('proposed','accepted','rejected','applied')),
  notes         text,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger set_updated_at before update on public.rent_reviews
for each row execute function public.tg_set_updated_at();

create table public.complaints (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id),
  property_id   uuid not null references public.properties(id),
  unit_id       uuid references public.units(id),
  subject       text not null,
  description   text,
  status        public.complaint_status not null default 'open',
  resolved_at   timestamptz,
  resolution_note text,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger set_updated_at before update on public.complaints
for each row execute function public.tg_set_updated_at();
create index idx_complaints_status on public.complaints (status) where deleted_at is null;

create table public.notices (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id),
  lease_id      uuid references public.leases(id),
  notice_type   text not null default 'general'
                check (notice_type in ('general','renewal','rent_review','quit','warning','maintenance')),
  title         text not null,
  body          text,
  acknowledged_at timestamptz,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger set_updated_at before update on public.notices
for each row execute function public.tg_set_updated_at();

-- =============================================================
-- Lease ↔ unit state machine.
-- SECURITY DEFINER: the unit flip is a system consequence of a
-- lease mutation the caller was already authorized to make; the
-- caller doesn't need direct units-update rights.
-- =============================================================
create or replace function public.tg_lease_unit_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Lease goes live → unit occupied
  if new.status in ('active','expiring')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.units set status = 'occupied'
    where id = new.unit_id and status <> 'occupied';
  end if;

  -- Lease ends → unit available, unless another live lease exists
  if new.status in ('terminated','expired')
     and (tg_op = 'INSERT' or old.status not in ('terminated','expired')) then
    if not exists (
      select 1 from public.leases
      where unit_id = new.unit_id
        and id <> new.id
        and status in ('active','expiring')
        and deleted_at is null
    ) then
      update public.units set status = 'available'
      where id = new.unit_id and status = 'occupied';
    end if;
  end if;

  return new;
end;
$$;

create trigger lease_unit_sync
after insert or update of status on public.leases
for each row execute function public.tg_lease_unit_sync();

-- =============================================================
-- lease_status_refresh() — called by the nightly edge function.
-- active → expiring within p_window days of end_date
-- expiring/active → expired past end_date
-- Notifies the property's assigned managers about newly
-- expiring leases. Returns counts for job logging.
-- =============================================================
create or replace function public.lease_status_refresh(p_window_days int default 90)
returns table (flipped_expiring int, flipped_expired int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expiring int;
  v_expired int;
begin
  with flipped as (
    update public.leases
    set status = 'expiring'
    where status = 'active'
      and deleted_at is null
      and end_date <= current_date + p_window_days
      and end_date >= current_date
    returning id, unit_id, end_date
  ),
  notif as (
    insert into public.notifications (user_id, type, title, body, link)
    select pm.user_id, 'action_required',
           'Lease expiring soon',
           'Lease on unit ' || u.unit_number || ' expires on ' || f.end_date::text,
           '/leases/' || f.id
    from flipped f
    join public.units u on u.id = f.unit_id
    join public.property_managers pm
      on pm.property_id = u.property_id and pm.deleted_at is null
    returning 1
  )
  select count(*) into v_expiring from flipped;

  update public.leases
  set status = 'expired'
  where status in ('active','expiring')
    and deleted_at is null
    and end_date < current_date;
  get diagnostics v_expired = row_count;

  return query select v_expiring, v_expired;
end;
$$;
