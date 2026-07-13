-- =============================================================
-- 00004: Seed — default organization_settings row and the
--        role_permissions matrix.
--
-- Modules (used consistently across all later phases):
--   settings, branches, users, permissions, audit,
--   properties, units, landlords, tenants, leases,
--   finance, maintenance, facilities, visitors, parking,
--   procurement, inventory, crm, projects, hr,
--   communications, reports, ai
--
-- Actions: view, create, update, delete, approve, export
-- (soft delete is an 'update' at the DB level, but the app
--  gates it behind the 'delete' permission)
-- =============================================================

-- Default (neutral) org settings row — rebrand via Settings UI.
insert into public.organization_settings (singleton) values (true)
on conflict (singleton) do nothing;

-- -------------------------------------------------------------
-- Helper to make grants readable. Dropped at the end.
-- -------------------------------------------------------------
create or replace function pg_temp.grant_perm(
  p_role public.app_role, p_module text, p_actions text[]
) returns void language sql as $$
  insert into public.role_permissions (role, module, action, allowed)
  select p_role, p_module, a, true from unnest(p_actions) as a
  on conflict (role, module, action) do update set allowed = true;
$$;

do $$
declare
  all_modules text[] := array[
    'settings','branches','users','permissions','audit',
    'properties','units','landlords','tenants','leases',
    'finance','maintenance','facilities','visitors','parking',
    'procurement','inventory','crm','projects','hr',
    'communications','reports','ai'
  ];
  all_actions text[] := array['view','create','update','delete','approve','export'];
  m text;
begin
  -- ============================================================
  -- FULL ACCESS: super_admin, company_owner
  -- ============================================================
  foreach m in array all_modules loop
    perform pg_temp.grant_perm('super_admin',   m, all_actions);
    perform pg_temp.grant_perm('company_owner', m, all_actions);
  end loop;

  -- ============================================================
  -- regional_manager — everything operational, no settings/
  -- permissions administration
  -- ============================================================
  foreach m in array array[
    'branches','properties','units','landlords','tenants','leases',
    'finance','maintenance','facilities','visitors','parking',
    'procurement','inventory','crm','projects','hr',
    'communications','reports','ai','audit','users'
  ] loop
    perform pg_temp.grant_perm('regional_manager', m,
      array['view','create','update','approve','export']);
  end loop;

  -- ============================================================
  -- branch_manager — operational within assigned branch
  -- (branch scoping is enforced by RLS, not by this matrix)
  -- ============================================================
  foreach m in array array[
    'properties','units','landlords','tenants','leases',
    'finance','maintenance','facilities','visitors','parking',
    'procurement','inventory','crm','projects',
    'communications','reports','ai'
  ] loop
    perform pg_temp.grant_perm('branch_manager', m,
      array['view','create','update','approve','export']);
  end loop;
  perform pg_temp.grant_perm('branch_manager', 'users', array['view']);
  perform pg_temp.grant_perm('branch_manager', 'hr',    array['view','approve']);

  -- ============================================================
  -- property_manager / estate_manager — same operational scope
  -- ============================================================
  foreach m in array array[
    'properties','units','landlords','tenants','leases',
    'maintenance','facilities','visitors','parking',
    'communications','reports','ai'
  ] loop
    perform pg_temp.grant_perm('property_manager', m,
      array['view','create','update','export']);
    perform pg_temp.grant_perm('estate_manager', m,
      array['view','create','update','export']);
  end loop;
  perform pg_temp.grant_perm('property_manager', 'finance', array['view','create','export']);
  perform pg_temp.grant_perm('estate_manager',   'finance', array['view','create','export']);
  perform pg_temp.grant_perm('property_manager', 'maintenance', array['approve']);
  perform pg_temp.grant_perm('estate_manager',   'maintenance', array['approve']);

  -- ============================================================
  -- facility_manager
  -- ============================================================
  perform pg_temp.grant_perm('facility_manager', 'facilities',
    array['view','create','update','delete','approve','export']);
  perform pg_temp.grant_perm('facility_manager', 'maintenance',
    array['view','create','update','approve','export']);
  perform pg_temp.grant_perm('facility_manager', 'properties', array['view']);
  perform pg_temp.grant_perm('facility_manager', 'units',      array['view']);
  perform pg_temp.grant_perm('facility_manager', 'inventory',  array['view','create']);
  perform pg_temp.grant_perm('facility_manager', 'reports',    array['view','export']);
  perform pg_temp.grant_perm('facility_manager', 'ai',         array['view']);

  -- ============================================================
  -- leasing_officer
  -- ============================================================
  perform pg_temp.grant_perm('leasing_officer', 'tenants',
    array['view','create','update','export']);
  perform pg_temp.grant_perm('leasing_officer', 'leases',
    array['view','create','update','export']);
  perform pg_temp.grant_perm('leasing_officer', 'units',      array['view','update']);
  perform pg_temp.grant_perm('leasing_officer', 'properties', array['view']);
  perform pg_temp.grant_perm('leasing_officer', 'landlords',  array['view']);
  perform pg_temp.grant_perm('leasing_officer', 'crm',        array['view','create','update']);
  perform pg_temp.grant_perm('leasing_officer', 'communications', array['view','create']);
  perform pg_temp.grant_perm('leasing_officer', 'reports',    array['view','export']);
  perform pg_temp.grant_perm('leasing_officer', 'ai',         array['view']);

  -- ============================================================
  -- sales_officer
  -- ============================================================
  perform pg_temp.grant_perm('sales_officer', 'crm',
    array['view','create','update','export']);
  perform pg_temp.grant_perm('sales_officer', 'properties', array['view']);
  perform pg_temp.grant_perm('sales_officer', 'units',      array['view']);
  perform pg_temp.grant_perm('sales_officer', 'communications', array['view','create']);
  perform pg_temp.grant_perm('sales_officer', 'reports',    array['view','export']);
  perform pg_temp.grant_perm('sales_officer', 'ai',         array['view']);

  -- ============================================================
  -- accountant
  -- ============================================================
  perform pg_temp.grant_perm('accountant', 'finance',
    array['view','create','update','approve','export']);
  perform pg_temp.grant_perm('accountant', 'properties', array['view']);
  perform pg_temp.grant_perm('accountant', 'units',      array['view']);
  perform pg_temp.grant_perm('accountant', 'tenants',    array['view']);
  perform pg_temp.grant_perm('accountant', 'landlords',  array['view']);
  perform pg_temp.grant_perm('accountant', 'leases',     array['view']);
  perform pg_temp.grant_perm('accountant', 'procurement', array['view','approve']);
  perform pg_temp.grant_perm('accountant', 'reports',    array['view','export']);
  perform pg_temp.grant_perm('accountant', 'audit',      array['view']);
  perform pg_temp.grant_perm('accountant', 'ai',         array['view']);

  -- ============================================================
  -- procurement_officer
  -- ============================================================
  perform pg_temp.grant_perm('procurement_officer', 'procurement',
    array['view','create','update','export']);
  perform pg_temp.grant_perm('procurement_officer', 'inventory',
    array['view','create','update','export']);
  perform pg_temp.grant_perm('procurement_officer', 'reports', array['view','export']);
  perform pg_temp.grant_perm('procurement_officer', 'ai',      array['view']);

  -- ============================================================
  -- maintenance_officer
  -- ============================================================
  perform pg_temp.grant_perm('maintenance_officer', 'maintenance',
    array['view','create','update','export']);
  perform pg_temp.grant_perm('maintenance_officer', 'facilities', array['view','update']);
  perform pg_temp.grant_perm('maintenance_officer', 'properties', array['view']);
  perform pg_temp.grant_perm('maintenance_officer', 'units',      array['view']);
  perform pg_temp.grant_perm('maintenance_officer', 'inventory',  array['view']);
  perform pg_temp.grant_perm('maintenance_officer', 'ai',         array['view']);

  -- ============================================================
  -- security_officer — gate operations only
  -- ============================================================
  perform pg_temp.grant_perm('security_officer', 'visitors',
    array['view','create','update']);
  perform pg_temp.grant_perm('security_officer', 'parking', array['view','update']);

  -- ============================================================
  -- receptionist
  -- ============================================================
  perform pg_temp.grant_perm('receptionist', 'visitors',
    array['view','create','update']);
  perform pg_temp.grant_perm('receptionist', 'tenants',        array['view']);
  perform pg_temp.grant_perm('receptionist', 'crm',            array['view','create']);
  perform pg_temp.grant_perm('receptionist', 'communications', array['view','create']);
  perform pg_temp.grant_perm('receptionist', 'maintenance',    array['view','create']);

  -- ============================================================
  -- Portal roles — their real access is row-scoped by RLS
  -- ("own records only"); the matrix only unlocks the module.
  -- ============================================================
  -- landlord / property_owner
  perform pg_temp.grant_perm('landlord', 'landlords', array['view']);
  perform pg_temp.grant_perm('landlord', 'properties', array['view']);
  perform pg_temp.grant_perm('landlord', 'units',      array['view']);
  perform pg_temp.grant_perm('landlord', 'finance',    array['view','export']);
  perform pg_temp.grant_perm('landlord', 'reports',    array['view','export']);
  perform pg_temp.grant_perm('property_owner', 'landlords',  array['view']);
  perform pg_temp.grant_perm('property_owner', 'properties', array['view']);
  perform pg_temp.grant_perm('property_owner', 'units',      array['view']);
  perform pg_temp.grant_perm('property_owner', 'finance',    array['view','export']);
  perform pg_temp.grant_perm('property_owner', 'reports',    array['view','export']);

  -- tenant
  perform pg_temp.grant_perm('tenant', 'tenants',     array['view']);
  perform pg_temp.grant_perm('tenant', 'leases',      array['view']);
  perform pg_temp.grant_perm('tenant', 'finance',     array['view']);
  perform pg_temp.grant_perm('tenant', 'maintenance', array['view','create']);
  perform pg_temp.grant_perm('tenant', 'visitors',    array['view','create']);
  perform pg_temp.grant_perm('tenant', 'parking',     array['view']);

  -- contractor
  perform pg_temp.grant_perm('contractor', 'maintenance', array['view','update']);

  -- vendor
  perform pg_temp.grant_perm('vendor', 'procurement', array['view']);

  -- ============================================================
  -- auditor — read/export everything, mutate nothing
  -- ============================================================
  foreach m in array all_modules loop
    perform pg_temp.grant_perm('auditor', m, array['view','export']);
  end loop;
end $$;

drop function pg_temp.grant_perm(public.app_role, text, text[]);
