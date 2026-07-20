-- =====================================================================
-- Phase 4 upgrade: feature flags, demo mode, and demo-data tagging.
-- Purely additive. Safe to run on an existing production database.
-- =====================================================================

-- 1) organization_settings: feature flags + demo-mode flag ------------
alter table public.organization_settings
  add column if not exists feature_flags jsonb   not null default '{}'::jsonb,
  add column if not exists demo_mode     boolean not null default false;

-- 2) Tag rows created by the Demo Data Manager so they can be purged. --
--    Added to the core operational tables the seeder populates.
do $$
declare t text;
begin
  foreach t in array array[
    'branches','properties','buildings','floors','units','land_parcels',
    'ownership_records','landlords','tenants','leases',
    'security_deposits','invoices','invoice_lines','payments',
    'maintenance_requests','contractors','work_orders','work_order_items',
    'assets','vendors'
  ] loop
    execute format(
      'alter table public.%I add column if not exists is_demo boolean not null default false',
      t
    );
    execute format(
      'create index if not exists %I on public.%I (is_demo) where is_demo',
      t || '_is_demo_idx', t
    );
  end loop;
end $$;

-- 3) Toggle demo mode (Super Admin only; RLS on the table still applies)
create or replace function public.set_demo_mode(p_on boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.organization_settings set demo_mode = p_on where singleton;
$$;

comment on function public.set_demo_mode is
  'Sets the org-wide demo_mode banner flag. Called by the Demo Data Manager.';

create or replace function public.delete_demo_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- FK-safe order (children first)
  delete from public.payments            where is_demo;
  delete from public.invoice_lines       where invoice_id in (select id from public.invoices where is_demo);
  delete from public.invoices            where is_demo;
  delete from public.work_order_items    where is_demo;
  delete from public.work_orders         where is_demo;
  delete from public.security_deposits   where is_demo;
  delete from public.leases              where is_demo;
  delete from public.ownership_records   where is_demo;
  delete from public.units               where is_demo;
  delete from public.floors              where is_demo;
  delete from public.buildings           where is_demo;
  delete from public.properties          where is_demo;
  delete from public.tenants             where is_demo;
  delete from public.landlords           where is_demo;
  delete from public.contractors         where is_demo;
  delete from public.assets              where is_demo;
  delete from public.vendors             where is_demo;
  delete from public.land_parcels        where is_demo;
  delete from public.branches            where is_demo;
  update public.organization_settings set demo_mode = false where singleton;
end $$;

create or replace function public.load_demo_data(p_scenario text default 'medium')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_branches int; n_props int; units_per int; occ_pct int; months int;
  v_branch uuid; v_prop uuid; v_bldg uuid; v_floor uuid; v_unit uuid;
  v_landlord uuid; v_tenant uuid; v_lease uuid; v_invoice uuid;
  prop_types text[] := array['residential','apartment_block','commercial','mixed_use','estate'];
  fnames text[] := array['Ada','Chidi','Ngozi','Emeka','Bola','Tunde','Ife','Zainab','Musa','Amaka','Kunle','Grace'];
  lnames text[] := array['Okafor','Balogun','Eze','Adeyemi','Bello','Nwosu','Obi','Danladi',' Okonkwo','Ibrahim'];
  pnames text[] := array['Skyline','Harmony','Cedar','Marina','Golden','Emerald','Sunrise','Palm','Crystal','Unity'];
  ptypes_lbl text[] := array['Towers','Court','Residences','Plaza','Gardens','Heights','Apartments','Estate'];
  i int; j int; u int; occupied_count int; created_units int := 0; created_leases int := 0;
  v_rent numeric; mth int; v_total numeric; v_paidst text; v_due date;
  n_invoices int := 0; n_payments int := 0;
begin
  -- purge any prior demo set for idempotency
  perform public.delete_demo_data();

  case lower(p_scenario)
    when 'small'        then n_branches:=1; n_props:=2; units_per:=6;  occ_pct:=70; months:=4;
    when 'large'        then n_branches:=1; n_props:=8; units_per:=14; occ_pct:=82; months:=6;
    when 'multi_branch' then n_branches:=3; n_props:=6; units_per:=10; occ_pct:=78; months:=5;
    when 'heavy'        then n_branches:=2; n_props:=6; units_per:=16; occ_pct:=88; months:=6;
    else /* medium */        n_branches:=1; n_props:=4; units_per:=10; occ_pct:=75; months:=5;
  end case;

  for i in 1..n_props loop
    if i = 1 or (i - 1) % greatest(1, ceil(n_props::numeric / n_branches)::int) = 0 then
      insert into public.branches (name, city, is_demo)
        values ('Nego Demo Branch '||(1 + (i-1)/greatest(1,ceil(n_props::numeric/n_branches)::int))::int, 'Lagos', true)
        returning id into v_branch;
    end if;

    insert into public.properties (branch_id, name, property_type, address, is_demo)
      values (v_branch,
              pnames[1+((i-1)%array_length(pnames,1))]||' '||ptypes_lbl[1+((i-1)%array_length(ptypes_lbl,1))],
              (prop_types[1+((i-1)%array_length(prop_types,1))])::property_type,
              (100+i)||' Demo Avenue, Lagos', true)
      returning id into v_prop;

    insert into public.buildings (property_id, name, is_demo)
      values (v_prop, 'Block A', true) returning id into v_bldg;
    insert into public.floors (building_id, floor_number, is_demo)
      values (v_bldg, 1, true) returning id into v_floor;

    occupied_count := floor(units_per * occ_pct / 100.0);
    for u in 1..units_per loop
      insert into public.units (property_id, floor_id, unit_number, unit_type, is_demo)
        values (v_prop, v_floor, 'U-'||lpad(u::text,2,'0'), 'apartment', true)
        returning id into v_unit;
      created_units := created_units + 1;

      if u <= occupied_count then
        -- a tenant + landlord for this occupied unit
        insert into public.tenants (full_name, phone, is_demo)
          values (fnames[1+((created_units)%array_length(fnames,1))]||' '||lnames[1+((created_units)%array_length(lnames,1))],
                  '+23480'||lpad((1000000+created_units)::text,7,'0'), true)
          returning id into v_tenant;

        v_rent := (150000 + (u%5)*50000);
        insert into public.leases (unit_id, tenant_id, start_date, end_date, rent_amount, status, is_demo)
          values (v_unit, v_tenant, current_date - (200 + u), current_date + (165 - u), v_rent, 'active', true)
          returning id into v_lease;
        created_leases := created_leases + 1;

        -- invoices + payments across recent months
        for mth in reverse (months-1)..0 loop
          v_due := date_trunc('month', current_date) - (mth||' months')::interval + interval '4 days';
          -- vary paid status: most paid, some partial, oldest sometimes overdue
          if mth = 0 and (u % 3 = 0) then v_total := v_rent; v_paidst := 'issued';        -- current, unpaid
          elsif (u % 7 = 0) and mth = months-1 then v_total := v_rent; v_paidst := 'overdue';
          elsif (u % 5 = 0) then v_total := v_rent; v_paidst := 'partially_paid';
          else v_total := v_rent; v_paidst := 'paid';
          end if;

          insert into public.invoices (tenant_id, property_id, due_date, issue_date, total,
                                       amount_paid, status, is_demo)
            values (v_tenant, v_prop, v_due::date, (v_due - interval '5 days')::date, v_total,
                    case v_paidst when 'paid' then v_total when 'partially_paid' then round(v_total*0.5) else 0 end,
                    v_paidst::invoice_status, true)
            returning id into v_invoice;
          n_invoices := n_invoices + 1;

          if v_paidst in ('paid','partially_paid') then
            insert into public.payments (tenant_id, amount, method, received_at, is_demo)
              values (v_tenant,
                      case v_paidst when 'paid' then v_total else round(v_total*0.5) end,
                      'bank_transfer',
                      (v_due - interval '2 days'), true);
            n_payments := n_payments + 1;
          end if;
        end loop;
      end if;
    end loop;

    -- one landlord owning the property
    insert into public.landlords (full_name, phone, is_demo)
      values (fnames[1+(i%array_length(fnames,1))]||' '||lnames[1+(i%array_length(lnames,1))]||' (Owner)',
              '+23481'||lpad((2000000+i)::text,7,'0'), true)
      returning id into v_landlord;
    insert into public.ownership_records (landlord_id, property_id, is_demo)
      values (v_landlord, v_prop, true);

    -- a couple of maintenance work orders
    insert into public.work_orders (property_id, title, status, is_demo)
      values (v_prop, 'Demo: replace corridor lighting', 'completed', true);
    insert into public.work_orders (property_id, title, status, is_demo)
      values (v_prop, 'Demo: service water pump', 'open', true);
  end loop;

  update public.organization_settings set demo_mode = true where singleton;

  return jsonb_build_object(
    'scenario', p_scenario,
    'branches', n_branches, 'properties', n_props,
    'units', created_units, 'active_leases', created_leases,
    'invoices', n_invoices, 'payments', n_payments
  );
end $$;

comment on function public.load_demo_data is 'Generates coherent demo data across core modules, tagged is_demo. Super Admin only.';
