-- =============================================================
-- 00010: Phase 3 — Finance RLS
-- Access model:
--   tenants   → own invoices/payments (read only)
--   landlords → invoices/statements for owned properties (read)
--   staff     → finance.* permission + property scope
--   auditor   → read via finance.view (already in matrix)
-- =============================================================

alter table public.invoices            enable row level security;
alter table public.invoice_lines       enable row level security;
alter table public.payments            enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.penalty_rules       enable row level security;
alter table public.discounts           enable row level security;
alter table public.utility_meters      enable row level security;
alter table public.meter_readings      enable row level security;
alter table public.expense_categories  enable row level security;
alter table public.expenses            enable row level security;
alter table public.landlord_statements enable row level security;
alter table public.disbursements       enable row level security;
alter table public.payment_providers   enable row level security;

-- Helper: can the caller see this invoice?
create or replace function public.can_access_invoice(p_invoice_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.invoices i
    where i.id = p_invoice_id
      and (
        i.tenant_id in (select public.my_tenant_ids())
        or (public.has_permission('finance','view')
            and i.property_id in (select public.user_property_ids()))
      )
  );
$$;

-- -------------------------------------------------------------
-- invoices
-- -------------------------------------------------------------
create policy invoices_read on public.invoices
  for select to authenticated
  using (deleted_at is null and public.can_access_invoice(id));

create policy invoices_insert on public.invoices
  for insert to authenticated
  with check (public.has_permission('finance','create')
              and property_id in (select public.user_property_ids()));

create policy invoices_update on public.invoices
  for update to authenticated
  using (public.has_permission('finance','update')
         and property_id in (select public.user_property_ids()))
  with check (public.has_permission('finance','update')
              and property_id in (select public.user_property_ids()));

-- invoice_lines follow their invoice
create policy invoice_lines_read on public.invoice_lines
  for select to authenticated
  using (public.can_access_invoice(invoice_id));

create policy invoice_lines_write on public.invoice_lines
  for insert to authenticated
  with check (public.has_permission('finance','create')
              and public.can_access_invoice(invoice_id));

-- -------------------------------------------------------------
-- payments — tenant reads own; staff record in scope
-- -------------------------------------------------------------
create policy payments_read on public.payments
  for select to authenticated
  using (deleted_at is null and (
    tenant_id in (select public.my_tenant_ids())
    or (public.has_permission('finance','view')
        and (property_id is null
             or property_id in (select public.user_property_ids())))
  ));

create policy payments_insert on public.payments
  for insert to authenticated
  with check (public.has_permission('finance','create'));

create policy payments_update on public.payments
  for update to authenticated
  using (public.has_permission('finance','update'))
  with check (public.has_permission('finance','update'));

create policy allocations_read on public.payment_allocations
  for select to authenticated
  using (public.can_access_invoice(invoice_id));

-- Allocations are written by allocate_payment() (security
-- definer); direct client inserts require finance.create too.
create policy allocations_write on public.payment_allocations
  for insert to authenticated
  with check (public.has_permission('finance','create')
              and public.can_access_invoice(invoice_id));

-- -------------------------------------------------------------
-- penalty rules, discounts — finance staff
-- -------------------------------------------------------------
create policy penalty_rules_read on public.penalty_rules
  for select to authenticated
  using (deleted_at is null and public.has_permission('finance','view'));
create policy penalty_rules_write on public.penalty_rules
  for insert to authenticated
  with check (public.has_permission('finance','update'));
create policy penalty_rules_update on public.penalty_rules
  for update to authenticated
  using (public.has_permission('finance','update'))
  with check (public.has_permission('finance','update'));

create policy discounts_read on public.discounts
  for select to authenticated
  using (deleted_at is null and public.can_access_invoice(invoice_id));
create policy discounts_write on public.discounts
  for insert to authenticated
  with check (public.has_permission('finance','approve')
              and public.can_access_invoice(invoice_id));

-- -------------------------------------------------------------
-- utilities — finance/facility staff in property scope
-- -------------------------------------------------------------
create policy meters_read on public.utility_meters
  for select to authenticated
  using (deleted_at is null
         and (public.has_permission('finance','view') or public.has_permission('facilities','view'))
         and property_id in (select public.user_property_ids()));
create policy meters_write on public.utility_meters
  for insert to authenticated
  with check (public.has_permission('finance','create')
              and property_id in (select public.user_property_ids()));
create policy meters_update on public.utility_meters
  for update to authenticated
  using (public.has_permission('finance','update')
         and property_id in (select public.user_property_ids()))
  with check (public.has_permission('finance','update')
              and property_id in (select public.user_property_ids()));

create policy readings_read on public.meter_readings
  for select to authenticated
  using (exists (select 1 from public.utility_meters m
                 where m.id = meter_id
                   and (public.has_permission('finance','view')
                        or public.has_permission('facilities','view'))
                   and m.property_id in (select public.user_property_ids())));
create policy readings_write on public.meter_readings
  for insert to authenticated
  with check (exists (select 1 from public.utility_meters m
                      where m.id = meter_id
                        and (public.has_permission('finance','create')
                             or public.has_permission('facilities','update'))
                        and m.property_id in (select public.user_property_ids())));

-- -------------------------------------------------------------
-- expenses
-- -------------------------------------------------------------
create policy expense_categories_read on public.expense_categories
  for select to authenticated using (true);
create policy expense_categories_write on public.expense_categories
  for insert to authenticated
  with check (public.has_permission('finance','update'));

create policy expenses_read on public.expenses
  for select to authenticated
  using (deleted_at is null
         and public.has_permission('finance','view')
         and (property_id is null
              or property_id in (select public.user_property_ids())));
create policy expenses_write on public.expenses
  for insert to authenticated
  with check (public.has_permission('finance','create')
              and (property_id is null
                   or property_id in (select public.user_property_ids())));
create policy expenses_update on public.expenses
  for update to authenticated
  using (public.has_permission('finance','update'))
  with check (public.has_permission('finance','update'));

-- -------------------------------------------------------------
-- landlord statements & disbursements
-- -------------------------------------------------------------
create policy statements_read on public.landlord_statements
  for select to authenticated
  using (deleted_at is null and (
    landlord_id in (select public.my_landlord_ids())
    or public.has_permission('finance','view')
  ));

create policy statements_write on public.landlord_statements
  for insert to authenticated
  with check (public.has_permission('finance','create'));

create policy statements_update on public.landlord_statements
  for update to authenticated
  using (public.has_permission('finance','update'))
  with check (public.has_permission('finance','update'));

create policy disbursements_read on public.disbursements
  for select to authenticated
  using (exists (select 1 from public.landlord_statements s
                 where s.id = statement_id
                   and (s.landlord_id in (select public.my_landlord_ids())
                        or public.has_permission('finance','view'))));

create policy disbursements_write on public.disbursements
  for insert to authenticated
  with check (public.has_permission('finance','approve'));

-- -------------------------------------------------------------
-- payment providers — admins only (contains gateway config)
-- -------------------------------------------------------------
create policy providers_read on public.payment_providers
  for select to authenticated
  using (public.has_permission('settings','update'));
create policy providers_write on public.payment_providers
  for insert to authenticated
  with check (public.has_permission('settings','update'));
create policy providers_update on public.payment_providers
  for update to authenticated
  using (public.has_permission('settings','update'))
  with check (public.has_permission('settings','update'));
