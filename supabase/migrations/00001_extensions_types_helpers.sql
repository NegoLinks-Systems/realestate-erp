-- =============================================================
-- 00001: Extensions, enums, and shared helper functions
-- White-Label Real Estate ERP — Phase 0
-- =============================================================

create extension if not exists "pgcrypto";

-- -------------------------------------------------------------
-- Roles (fixed enum; permissions are data-driven per role)
-- -------------------------------------------------------------
create type public.app_role as enum (
  'super_admin',
  'company_owner',
  'regional_manager',
  'branch_manager',
  'property_manager',
  'estate_manager',
  'facility_manager',
  'leasing_officer',
  'sales_officer',
  'accountant',
  'procurement_officer',
  'maintenance_officer',
  'security_officer',
  'receptionist',
  'landlord',
  'tenant',
  'property_owner',
  'contractor',
  'vendor',
  'auditor'
);

create type public.notification_type as enum (
  'info', 'warning', 'action_required', 'success'
);

-- -------------------------------------------------------------
-- updated_at trigger helper (attach to every table)
-- -------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

