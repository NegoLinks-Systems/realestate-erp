-- Functional verification suite (run on a fresh DB after all
-- migrations; on plain Postgres apply test/00000_supabase_stub.sql first)
\pset tuples_only on
select 'permission rows: ' || count(*) from role_permissions where allowed;
select 'super_admin (expect 138): ' || count(*) from role_permissions where role='super_admin' and allowed;
select 'auditor (expect 46): ' || count(*) from role_permissions where role='auditor' and allowed;
select 'org settings rows (expect 1): ' || count(*) from organization_settings;

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','acct@test.local');
insert into user_roles (user_id, role) values ('11111111-1111-1111-1111-111111111111','accountant');
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'accountant finance.approve (expect t): ' || has_permission('finance','approve');
select 'accountant settings.update (expect f): ' || has_permission('settings','update');
select 'accountant is_admin (expect f): ' || is_admin();

grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
set role authenticated;
update organization_settings set organization_name = 'HACKED';
reset role;
select 'org name unchanged (expect My Organization): ' || organization_name from organization_settings;

-- expected to ERROR (singleton):
insert into organization_settings (singleton) values (true);
select 'org settings rows after dup attempt (expect 1): ' || count(*) from organization_settings;

-- ================= Phase 1 verification =================
insert into branches (id, name, code) values
  ('b0000000-0000-0000-0000-000000000001','Lagos Main','LAG-01');
insert into properties (id, branch_id, name, property_type) values
  ('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Sunrise Estate','estate'),
  ('a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','Harbor Mall','mall');
insert into buildings (id, property_id, name) values
  ('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Block A');
insert into floors (id, building_id, floor_number) values
  ('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',1);
insert into auth.users (id, email) values ('22222222-2222-2222-2222-222222222222','manager@test.local');
insert into user_roles (user_id, role) values ('22222222-2222-2222-2222-222222222222','property_manager');
insert into property_managers (property_id, user_id) values
  ('a0000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222');
grant execute on all functions in schema public to authenticated;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'manager sees (expect 1 / Sunrise Estate): ' || count(*) || ' / ' || string_agg(name,',') from properties;
select 'units generated (expect 5): ' || count(*)
  from generate_units('d0000000-0000-0000-0000-000000000001','A-',5,'apartment',2500000,150000,2);
update units set status='occupied' where unit_number in ('A-101','A-102');
select 'occupancy (expect 40.0): ' || occupancy_rate from portfolio_stats();
-- expected to ERROR (cross-property write):
insert into property_photos (property_id, storage_path)
  values ('a0000000-0000-0000-0000-000000000002','x/y.jpg');
reset role;
select 'mall photos (expect 0): ' || count(*) from property_photos
  where property_id='a0000000-0000-0000-0000-000000000002';

-- ================= Phase 2 verification =================
insert into units (id, property_id, unit_number, unit_type, base_rent) values
  ('e0000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001','Z-901','apartment',1000000);
insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444','tenant@test.local');
insert into user_roles (user_id, role) values
  ('44444444-4444-4444-4444-444444444444','tenant');
insert into tenants (id, user_id, full_name) values
  ('f0000000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','Test Tenant');

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; -- property_manager from Phase 1 tests
insert into leases (id, unit_id, tenant_id, status, start_date, end_date, rent_amount) values
  ('10000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000009',
   'f0000000-0000-0000-0000-000000000001','active', current_date, current_date + 365, 1000000);
select 'unit occupied after activation (expect occupied): ' || status from units where unit_number='Z-901';
-- expected to ERROR (double live lease):
insert into leases (unit_id, tenant_id, status, start_date, end_date, rent_amount) values
  ('e0000000-0000-0000-0000-000000000009','f0000000-0000-0000-0000-000000000001',
   'active', current_date, current_date + 365, 1000000);

set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select 'tenant sees own lease (expect 1): ' || count(*) from leases;
select 'tenant sees own unit (expect Z-901): ' || string_agg(unit_number,',') from units;

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update leases set status='terminated' where id='10000000-0000-0000-0000-000000000001';
select 'unit freed after termination (expect available): ' || status from units where unit_number='Z-901';
reset role;

-- ================= Phase 3 verification =================
insert into auth.users (id, email) values ('77777777-7777-7777-7777-777777777777','acct@test.local');
insert into user_roles (user_id, role) values ('77777777-7777-7777-7777-777777777777','accountant');
insert into units (id, property_id, unit_number, unit_type, base_rent) values
  ('e0000000-0000-0000-0000-000000000010','a0000000-0000-0000-0000-000000000001','Z-902','apartment',100000);
insert into leases (unit_id, tenant_id, status, start_date, end_date, rent_amount, rent_frequency, service_charge)
values ('e0000000-0000-0000-0000-000000000010','f0000000-0000-0000-0000-000000000001',
        'active', current_date - 75, current_date + 290, 100000,'monthly',10000);
grant usage on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

set role authenticated;
set request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
select 'billing_run (expect 3): ' || billing_run();
select 'billing_run idempotent (expect 0): ' || billing_run();
insert into penalty_rules (name, grace_days, percent) values ('Late fee 5%', 30, 5);
select 'penalties (expect 2): ' || apply_penalties();
select 'penalties idempotent (expect 0): ' || apply_penalties();

insert into payments (id, tenant_id, property_id, amount, method) values
  ('20000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',150000,'bank_transfer');
select 'allocation touches (expect 2): ' || allocate_payment('20000000-0000-0000-0000-000000000001');
select 'oldest paid (expect paid): ' || status from invoices order by due_date limit 1;

reset role;
insert into landlords (id, full_name) values ('f1000000-0000-0000-0000-000000000009','Verify Holdings');
insert into ownership_records (landlord_id, property_id, ownership_percent, management_fee_percent)
values ('f1000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001',100,10);
set role authenticated;
set request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
select 'statement created (expect true): ' || (generate_landlord_statement(
  'f1000000-0000-0000-0000-000000000009', current_date - 90, current_date) is not null);
select 'net = gross - fee - expenses (expect true): ' || (net_due = gross_collected - management_fee - expenses_total)
  from landlord_statements where landlord_id='f1000000-0000-0000-0000-000000000009';
reset role;

-- ================= Phase 4 verification =================
insert into auth.users (id, email) values ('88888888-8888-8888-8888-888888888888','fixit@test.local');
insert into user_roles (user_id, role) values ('88888888-8888-8888-8888-888888888888','contractor');
insert into contractors (id, user_id, company_name) values
  ('c1000000-0000-0000-0000-000000000001','88888888-8888-8888-8888-888888888888','FixIt Ltd');

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; -- property_manager
insert into work_orders (id, property_id, title, contractor_id) values
  ('50000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
   'Verify test WO','c1000000-0000-0000-0000-000000000001');

set request.jwt.claim.sub = '88888888-8888-8888-8888-888888888888';
select 'contractor sees assigned (expect 1): ' || count(*) from work_orders
  where id='50000000-0000-0000-0000-000000000001';
insert into work_order_items (work_order_id, item_type, description, quantity, unit_cost) values
  ('50000000-0000-0000-0000-000000000001','labor','Callout',1,10000);
select 'rollup (expect 10000): ' || total_cost from work_orders
  where id='50000000-0000-0000-0000-000000000001';
update work_orders set status='completed', completed_at=now()
  where id='50000000-0000-0000-0000-000000000001';
-- expected to ERROR (contractor cannot verify):
update work_orders set status='verified' where id='50000000-0000-0000-0000-000000000001';

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update work_orders set status='verified' where id='50000000-0000-0000-0000-000000000001';
select 'expense posted once (expect 1): ' || count(*) from expenses
  where work_order_id='50000000-0000-0000-0000-000000000001';

insert into maintenance_schedules (property_id, title, recurrence_months, next_run) values
  ('a0000000-0000-0000-0000-000000000001','Preventive test',3,current_date);
select 'materialize (expect 1): ' || materialize_maintenance_schedules();
select 'materialize idempotent (expect 0): ' || materialize_maintenance_schedules();
reset role;

-- ================= Phase 5 verification =================
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; -- property_manager (has facilities perms? estate/property manager: facilities yes)
insert into assets (id, property_id, category, name, status) values
  ('60000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
   'generator','Verify Genset','under_repair');
insert into work_orders (id, property_id, title, asset_id, status, completed_at) values
  ('50000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001',
   'Genset service','60000000-0000-0000-0000-000000000001','completed',now());
update work_orders set status='verified' where id='50000000-0000-0000-0000-000000000002';
select 'service history (expect 1): ' || count(*) from asset_service_history
  where work_order_id='50000000-0000-0000-0000-000000000002';
select 'asset operational again (expect t): ' || (status='operational')
  from assets where id='60000000-0000-0000-0000-000000000001';

insert into inspections (id, property_id, title, status) values
  ('62000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Verify check','in_progress');
insert into inspection_items (inspection_id, label, score) values
  ('62000000-0000-0000-0000-000000000001','Item A',5),
  ('62000000-0000-0000-0000-000000000001','Item B',3);
select 'inspection score (expect 4.0): ' || overall_score from inspections
  where id='62000000-0000-0000-0000-000000000001';
reset role;

-- ================= Phase 6 verification =================
insert into auth.users (id, email) values ('99999999-9999-9999-9999-999999999999','guard@test.local');
insert into user_roles (user_id, role) values ('99999999-9999-9999-9999-999999999999','security_officer');
insert into property_managers (property_id, user_id) values
  ('a0000000-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999999');

set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444'; -- tenant/host
insert into visitors (id, full_name) values ('70000000-0000-0000-0000-000000000001','Verify Guest');
insert into visitor_passes (visitor_id, host_user_id, property_id, valid_to, qr_token) values
  ('70000000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444',
   'a0000000-0000-0000-0000-000000000001', now() + interval '8 hours',
   '72000000-0000-0000-0000-000000000001');
-- expected to ERROR (host cannot operate gate):
select check_in_pass('72000000-0000-0000-0000-000000000001');

set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select 'check-in ok (expect t): ' ||
  (check_in_pass('72000000-0000-0000-0000-000000000001') is not null);
select check_out_pass('72000000-0000-0000-0000-000000000001');
select 'pass checked_out (expect t): ' || (status='checked_out')
  from visitor_passes where qr_token='72000000-0000-0000-0000-000000000001';

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; -- property_manager
insert into parking_zones (id, property_id, name) values
  ('73000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Verify Zone');
insert into parking_spaces (id, zone_id, space_number) values
  ('74000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001','V-01');
insert into parking_allocations (space_id, tenant_id, monthly_fee) values
  ('74000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001',15000);
select 'parking billed (expect 1): ' || parking_billing_run();
select 'parking idempotent (expect 0): ' || parking_billing_run();
reset role;

-- ================= Phase 7 verification =================
insert into auth.users (id, email) values
  ('a1111111-1111-4111-8111-111111111111','proc@verify.local'),
  ('a2222222-2222-4222-8222-222222222222','acct2@verify.local');
insert into user_roles (user_id, role) values
  ('a1111111-1111-4111-8111-111111111111','procurement_officer'),
  ('a2222222-2222-4222-8222-222222222222','accountant');
insert into vendors (id, company_name) values
  ('80000000-0000-0000-0000-000000000001','Verify Vendor');
insert into warehouses (id, name) values ('81000000-0000-0000-0000-000000000001','Verify Store');
insert into inventory_items (id, sku, name, reorder_level, default_cost) values
  ('82000000-0000-0000-0000-000000000001','VER-ITEM','Verify item',5,1000);

set role authenticated;
set request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
insert into purchase_requisitions (id, requested_by, status) values
  ('83000000-0000-0000-0000-000000000001','a1111111-1111-4111-8111-111111111111','submitted');
-- expected to ERROR (no approve permission):
select approve_requisition('83000000-0000-0000-0000-000000000001', true);
set request.jwt.claim.sub = 'a2222222-2222-4222-8222-222222222222';
select approve_requisition('83000000-0000-0000-0000-000000000001', true);
select 'requisition approved (expect approved): ' || status
  from purchase_requisitions where id='83000000-0000-0000-0000-000000000001';

set request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
insert into purchase_orders (id, vendor_id, warehouse_id, status) values
  ('84000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001',
   '81000000-0000-0000-0000-000000000001','draft');
insert into po_lines (id, po_id, item_id, description, quantity, unit_cost) values
  ('85000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000001',
   '82000000-0000-0000-0000-000000000001','Verify item',10,1000);
update purchase_orders set status='issued' where id='84000000-0000-0000-0000-000000000001';
select 'partial receipt ok: ' || (receive_goods('84000000-0000-0000-0000-000000000001',
  '[{"po_line_id":"85000000-0000-0000-0000-000000000001","quantity":6}]') is not null);
select 'stock (expect 6): ' || quantity from stock_levels
  where item_id='82000000-0000-0000-0000-000000000001';
-- expected to ERROR (over-receipt):
select receive_goods('84000000-0000-0000-0000-000000000001',
  '[{"po_line_id":"85000000-0000-0000-0000-000000000001","quantity":5}]');
select 'PO partially_received (expect t): ' || (status='partially_received')
  from purchase_orders where id='84000000-0000-0000-0000-000000000001';
select 'low stock fires at 6>5? (expect 0): ' || count(*) from low_stock_items()
  where sku='VER-ITEM';
reset role;
-- expected to ERROR (ledger immutable):
update stock_movements set quantity=999
  where item_id='82000000-0000-0000-0000-000000000001';
