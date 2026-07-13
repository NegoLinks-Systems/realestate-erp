-- =============================================================
-- 00009: Phase 3 — Rent, Billing & Finance
-- Tables: invoices, invoice_lines, payments, payment_allocations,
--         penalty_rules, discounts, utility_meters, meter_readings,
--         expense_categories, expenses, landlord_statements,
--         disbursements, payment_providers
-- Logic:  billing_run(), allocate_payment(), apply_penalties(),
--         refresh_invoice_status(), generate_landlord_statement()
-- =============================================================

create type public.invoice_status as enum
  ('draft','issued','partially_paid','paid','overdue','void');
create type public.invoice_line_type as enum
  ('rent','service_charge','utility','penalty','parking','discount','other');
create type public.payment_method as enum
  ('cash','bank_transfer','pos','cheque','online');

create sequence public.invoice_number_seq;

-- -------------------------------------------------------------
-- invoices. tenant/unit/property are denormalized from the lease
-- for cheap scoping and reporting.
-- -------------------------------------------------------------
create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  invoice_number text not null unique
                 default 'INV-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0'),
  lease_id       uuid references public.leases(id),
  tenant_id      uuid not null references public.tenants(id),
  unit_id        uuid references public.units(id),
  property_id    uuid not null references public.properties(id),
  status         public.invoice_status not null default 'issued',
  issue_date     date not null default current_date,
  due_date       date not null,
  period_start   date,
  period_end     date,
  total          numeric(14,2) not null default 0 check (total >= 0),
  amount_paid    numeric(14,2) not null default 0 check (amount_paid >= 0),
  void_reason    text,

  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create trigger set_updated_at before update on public.invoices
for each row execute function public.tg_set_updated_at();
create index idx_invoices_tenant   on public.invoices (tenant_id) where deleted_at is null;
create index idx_invoices_property on public.invoices (property_id) where deleted_at is null;
create index idx_invoices_status   on public.invoices (status, due_date) where deleted_at is null;

create table public.invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id),
  line_type    public.invoice_line_type not null,
  description  text not null,
  amount       numeric(14,2) not null,          -- discounts are negative
  source_ref   text,                            -- e.g. penalty_rule id, for idempotency

  created_at   timestamptz not null default now()
);
create index idx_invoice_lines_invoice on public.invoice_lines (invoice_id);

-- -------------------------------------------------------------
-- payments & allocations
-- -------------------------------------------------------------
create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id),
  property_id  uuid references public.properties(id),
  amount       numeric(14,2) not null check (amount > 0),
  method       public.payment_method not null,
  reference    text,
  received_at  timestamptz not null default now(),
  received_by  uuid references auth.users(id),
  notes        text,

  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create trigger set_updated_at before update on public.payments
for each row execute function public.tg_set_updated_at();
create index idx_payments_tenant on public.payments (tenant_id) where deleted_at is null;

create table public.payment_allocations (
  id           uuid primary key default gen_random_uuid(),
  payment_id   uuid not null references public.payments(id),
  invoice_id   uuid not null references public.invoices(id),
  amount       numeric(14,2) not null check (amount > 0),

  created_at   timestamptz not null default now(),

  unique (payment_id, invoice_id)
);
create index idx_alloc_invoice on public.payment_allocations (invoice_id);

-- -------------------------------------------------------------
-- penalty rules & discounts
-- -------------------------------------------------------------
create table public.penalty_rules (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid references public.properties(id),  -- null = org default
  name         text not null,
  grace_days   int not null default 0 check (grace_days >= 0),
  percent      numeric(5,2) check (percent > 0),       -- either percent
  flat_amount  numeric(14,2) check (flat_amount > 0),  -- or flat
  active       boolean not null default true,

  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  check (percent is not null or flat_amount is not null)
);
create trigger set_updated_at before update on public.penalty_rules
for each row execute function public.tg_set_updated_at();

create table public.discounts (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id),
  amount       numeric(14,2) not null check (amount > 0),
  reason       text not null,
  approved_by  uuid references auth.users(id),

  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create trigger set_updated_at before update on public.discounts
for each row execute function public.tg_set_updated_at();

-- -------------------------------------------------------------
-- utilities
-- -------------------------------------------------------------
create table public.utility_meters (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties(id),
  unit_id      uuid references public.units(id),
  utility_type text not null check (utility_type in ('electricity','water','gas','diesel','other')),
  meter_number text not null,
  unit_rate    numeric(14,4) not null default 0 check (unit_rate >= 0),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  unique (property_id, meter_number)
);
create trigger set_updated_at before update on public.utility_meters
for each row execute function public.tg_set_updated_at();

create table public.meter_readings (
  id           uuid primary key default gen_random_uuid(),
  meter_id     uuid not null references public.utility_meters(id),
  reading      numeric(14,2) not null check (reading >= 0),
  read_at      date not null default current_date,
  read_by      uuid references auth.users(id),

  created_at   timestamptz not null default now()
);
create index idx_readings_meter on public.meter_readings (meter_id, read_at desc);

-- -------------------------------------------------------------
-- expenses
-- -------------------------------------------------------------
create table public.expense_categories (
  id     uuid primary key default gen_random_uuid(),
  name   text not null unique,
  created_at timestamptz not null default now()
);

insert into public.expense_categories (name) values
  ('maintenance'), ('utilities'), ('security'), ('cleaning'),
  ('insurance'), ('statutory'), ('salaries'), ('other');

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid references public.properties(id),
  category_id  uuid not null references public.expense_categories(id),
  description  text not null,
  amount       numeric(14,2) not null check (amount > 0),
  incurred_at  date not null default current_date,
  vendor_name  text,
  receipt_path text,

  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create trigger set_updated_at before update on public.expenses
for each row execute function public.tg_set_updated_at();
create index idx_expenses_property on public.expenses (property_id, incurred_at) where deleted_at is null;

-- -------------------------------------------------------------
-- landlord statements & disbursements
-- -------------------------------------------------------------
create table public.landlord_statements (
  id             uuid primary key default gen_random_uuid(),
  landlord_id    uuid not null references public.landlords(id),
  period_start   date not null,
  period_end     date not null,
  gross_collected numeric(14,2) not null default 0,
  management_fee  numeric(14,2) not null default 0,
  expenses_total  numeric(14,2) not null default 0,
  net_due         numeric(14,2) not null default 0,
  breakdown      jsonb not null default '{}',
  status         text not null default 'draft'
                 check (status in ('draft','finalized','disbursed')),

  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,

  unique (landlord_id, period_start, period_end)
);
create trigger set_updated_at before update on public.landlord_statements
for each row execute function public.tg_set_updated_at();

create table public.disbursements (
  id            uuid primary key default gen_random_uuid(),
  statement_id  uuid not null references public.landlord_statements(id),
  amount        numeric(14,2) not null check (amount > 0),
  method        public.payment_method not null,
  reference     text,
  disbursed_at  timestamptz not null default now(),
  disbursed_by  uuid references auth.users(id),

  created_at    timestamptz not null default now()
);

-- -------------------------------------------------------------
-- payment provider stub (gateways plug in later, Phase 3 spec)
-- -------------------------------------------------------------
create table public.payment_providers (
  id           uuid primary key default gen_random_uuid(),
  provider_key text not null unique,           -- 'paystack', 'flutterwave', ...
  display_name text not null,
  config       jsonb not null default '{}',    -- publishable keys etc; secrets go in Vault
  active       boolean not null default false,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger set_updated_at before update on public.payment_providers
for each row execute function public.tg_set_updated_at();

-- =============================================================
-- Money logic
-- =============================================================

-- Recompute total, amount_paid, and status for one invoice.
create or replace function public.refresh_invoice_status(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.invoices%rowtype;
  v_total numeric(14,2);
  v_paid  numeric(14,2);
begin
  select * into v from public.invoices where id = p_invoice_id for update;
  if not found or v.status = 'void' then return; end if;

  select coalesce(sum(amount),0) into v_total
    from public.invoice_lines where invoice_id = p_invoice_id;
  select coalesce(sum(amount),0) into v_paid
    from public.payment_allocations where invoice_id = p_invoice_id;

  update public.invoices set
    total = v_total,
    amount_paid = v_paid,
    status = case
      when v_paid >= v_total and v_total > 0 then 'paid'::public.invoice_status
      when v_paid > 0                        then 'partially_paid'::public.invoice_status
      when v.due_date < current_date         then 'overdue'::public.invoice_status
      else 'issued'::public.invoice_status
    end
  where id = p_invoice_id;
end;
$$;

-- Months per billing frequency
create or replace function public.frequency_months(p_freq text)
returns int language sql immutable as $$
  select case p_freq
    when 'monthly' then 1 when 'quarterly' then 3
    when 'biannual' then 6 else 12 end;
$$;

-- billing_run(): for every live lease, generate any invoices whose
-- period has started and isn't billed yet. Idempotent: re-running
-- creates nothing new. Returns number of invoices created.
create or replace function public.billing_run()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_months int;
  v_next_start date;
  v_period_end date;
  v_created int := 0;
  v_invoice_id uuid;
  v_guard int;
begin
  for r in
    select le.*, u.property_id, u.unit_number
    from public.leases le
    join public.units u on u.id = le.unit_id
    where le.status in ('active','expiring')
      and le.deleted_at is null
  loop
    v_months := public.frequency_months(r.rent_frequency);

    select coalesce(max(period_end) + 1, r.start_date)
      into v_next_start
      from public.invoices
      where lease_id = r.id and status <> 'void' and deleted_at is null;

    v_guard := 0;
    while v_next_start <= current_date
      and v_next_start < r.end_date
      and v_guard < 24
    loop
      v_period_end := least(
        (v_next_start + (v_months || ' months')::interval - interval '1 day')::date,
        r.end_date);

      insert into public.invoices
        (lease_id, tenant_id, unit_id, property_id,
         due_date, period_start, period_end, created_by)
      values
        (r.id, r.tenant_id, r.unit_id, r.property_id,
         v_next_start, v_next_start, v_period_end, auth.uid())
      returning id into v_invoice_id;

      insert into public.invoice_lines (invoice_id, line_type, description, amount)
      values (v_invoice_id, 'rent',
              'Rent ' || r.unit_number || ' (' || v_next_start || ' – ' || v_period_end || ')',
              r.rent_amount);

      if r.service_charge > 0 then
        insert into public.invoice_lines (invoice_id, line_type, description, amount)
        values (v_invoice_id, 'service_charge', 'Service charge', r.service_charge);
      end if;

      perform public.refresh_invoice_status(v_invoice_id);
      v_created := v_created + 1;
      v_next_start := v_period_end + 1;
      v_guard := v_guard + 1;
    end loop;
  end loop;

  -- flip overdue
  update public.invoices set status = 'overdue'
  where status in ('issued','partially_paid')
    and due_date < current_date
    and deleted_at is null
    and amount_paid < total;

  return v_created;
end;
$$;

-- apply_penalties(): adds ONE penalty line per (invoice, rule),
-- keyed by source_ref for idempotency. Property rule wins over
-- org default. Returns penalties added.
create or replace function public.apply_penalties()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_rule public.penalty_rules%rowtype;
  v_amount numeric(14,2);
  v_added int := 0;
begin
  for r in
    select i.* from public.invoices i
    where i.status = 'overdue' and i.deleted_at is null
  loop
    select * into v_rule from public.penalty_rules
    where active and deleted_at is null
      and (property_id = r.property_id or property_id is null)
      and r.due_date + grace_days < current_date
    order by property_id nulls last
    limit 1;

    if not found then continue; end if;

    if exists (select 1 from public.invoice_lines
               where invoice_id = r.id and line_type = 'penalty'
                 and source_ref = v_rule.id::text) then
      continue;
    end if;

    v_amount := coalesce(
      round(r.total * v_rule.percent / 100.0, 2),
      v_rule.flat_amount);

    insert into public.invoice_lines
      (invoice_id, line_type, description, amount, source_ref)
    values (r.id, 'penalty', 'Late payment penalty (' || v_rule.name || ')',
            v_amount, v_rule.id::text);

    perform public.refresh_invoice_status(r.id);
    v_added := v_added + 1;
  end loop;
  return v_added;
end;
$$;

-- allocate_payment(): oldest-first (by due_date) across the
-- tenant's unpaid invoices. Caller must hold finance.create.
create or replace function public.allocate_payment(p_payment_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.payments%rowtype;
  v_remaining numeric(14,2);
  r record;
  v_alloc numeric(14,2);
  v_count int := 0;
begin
  if not public.has_permission('finance','create') then
    raise exception 'finance.create permission required';
  end if;

  select * into v_pay from public.payments
  where id = p_payment_id and deleted_at is null for update;
  if not found then raise exception 'Payment % not found', p_payment_id; end if;

  select v_pay.amount - coalesce(sum(amount),0) into v_remaining
  from public.payment_allocations where payment_id = p_payment_id;

  for r in
    select i.id, i.total - i.amount_paid as outstanding
    from public.invoices i
    where i.tenant_id = v_pay.tenant_id
      and i.status in ('issued','partially_paid','overdue')
      and i.deleted_at is null
      and i.total > i.amount_paid
    order by i.due_date asc, i.created_at asc
  loop
    exit when v_remaining <= 0;
    v_alloc := least(v_remaining, r.outstanding);

    insert into public.payment_allocations (payment_id, invoice_id, amount)
    values (p_payment_id, r.id, v_alloc)
    on conflict (payment_id, invoice_id)
    do update set amount = public.payment_allocations.amount + excluded.amount;

    perform public.refresh_invoice_status(r.id);
    v_remaining := v_remaining - v_alloc;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- generate_landlord_statement(): for a landlord and period —
--   gross    = rent collections on owned properties × ownership %
--   fee      = gross × management_fee_percent
--   expenses = property expenses in period × ownership %
--   net      = gross − fee − expenses
-- Collections are payment allocations dated in the period.
create or replace function public.generate_landlord_statement(
  p_landlord_id uuid, p_start date, p_end date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gross numeric(14,2) := 0;
  v_fee numeric(14,2) := 0;
  v_expenses numeric(14,2) := 0;
  o record;
  v_col numeric(14,2);
  v_exp numeric(14,2);
  v_id uuid;
  v_detail jsonb := '[]';
begin
  if not public.has_permission('finance','create') then
    raise exception 'finance.create permission required';
  end if;

  for o in
    select * from public.ownership_records
    where landlord_id = p_landlord_id and deleted_at is null
      and start_date <= p_end
      and (end_date is null or end_date >= p_start)
  loop
    select coalesce(sum(pa.amount),0) into v_col
    from public.payment_allocations pa
    join public.payments pm on pm.id = pa.payment_id and pm.deleted_at is null
    join public.invoices i on i.id = pa.invoice_id and i.deleted_at is null
    where i.property_id = o.property_id
      and (o.unit_id is null or i.unit_id = o.unit_id)
      and pm.received_at::date between p_start and p_end;

    select coalesce(sum(e.amount),0) into v_exp
    from public.expenses e
    where e.property_id = o.property_id and e.deleted_at is null
      and e.incurred_at between p_start and p_end
      and o.unit_id is null;  -- whole-property owners bear property expenses

    v_col := round(v_col * o.ownership_percent / 100.0, 2);
    v_exp := round(v_exp * o.ownership_percent / 100.0, 2);

    v_gross := v_gross + v_col;
    v_fee := v_fee + round(v_col * o.management_fee_percent / 100.0, 2);
    v_expenses := v_expenses + v_exp;

    v_detail := v_detail || jsonb_build_object(
      'property_id', o.property_id, 'unit_id', o.unit_id,
      'ownership_percent', o.ownership_percent,
      'collected', v_col, 'expenses', v_exp);
  end loop;

  insert into public.landlord_statements
    (landlord_id, period_start, period_end,
     gross_collected, management_fee, expenses_total, net_due,
     breakdown, created_by)
  values
    (p_landlord_id, p_start, p_end,
     v_gross, v_fee, v_expenses, v_gross - v_fee - v_expenses,
     jsonb_build_object('lines', v_detail), auth.uid())
  on conflict (landlord_id, period_start, period_end)
  do update set
     gross_collected = excluded.gross_collected,
     management_fee = excluded.management_fee,
     expenses_total = excluded.expenses_total,
     net_due = excluded.net_due,
     breakdown = excluded.breakdown
  returning id into v_id;

  return v_id;
end;
$$;
