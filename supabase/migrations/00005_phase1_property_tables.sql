-- =============================================================
-- 00005: Phase 1 — Property Portfolio & Unit Management
-- Tables: properties, buildings, floors, units, land_parcels,
--         property_photos, property_documents, property_managers
-- =============================================================

create type public.property_type as enum (
  'residential', 'commercial', 'mixed_use', 'mall', 'office_building',
  'estate', 'apartment_block', 'house', 'warehouse', 'land'
);

create type public.unit_type as enum (
  'apartment', 'shop', 'office', 'villa', 'parking_space',
  'warehouse_unit', 'house', 'land_plot', 'other'
);

create type public.unit_status as enum (
  'available', 'reserved', 'occupied', 'maintenance', 'unlisted'
);

-- -------------------------------------------------------------
-- properties
-- -------------------------------------------------------------
create table public.properties (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references public.branches(id),
  name          text not null,
  code          text unique,                          -- e.g. "PRO-0001"
  property_type public.property_type not null,
  address       text,
  city          text,
  state         text,
  country       text not null default 'Nigeria',
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  year_built    int check (year_built between 1800 and 2200),
  description   text,
  status        text not null default 'active'
                check (status in ('active','inactive','under_development','sold')),

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create trigger set_updated_at before update on public.properties
for each row execute function public.tg_set_updated_at();

create index idx_properties_branch on public.properties (branch_id) where deleted_at is null;
create index idx_properties_type   on public.properties (property_type) where deleted_at is null;

-- -------------------------------------------------------------
-- buildings / floors
-- -------------------------------------------------------------
create table public.buildings (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties(id),
  name          text not null,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  unique (property_id, name)
);

create trigger set_updated_at before update on public.buildings
for each row execute function public.tg_set_updated_at();

create table public.floors (
  id            uuid primary key default gen_random_uuid(),
  building_id   uuid not null references public.buildings(id),
  floor_number  int not null,                         -- 0 = ground, -1 = basement
  name          text,                                 -- optional label ("Mezzanine")

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  unique (building_id, floor_number)
);

create trigger set_updated_at before update on public.floors
for each row execute function public.tg_set_updated_at();

-- -------------------------------------------------------------
-- units — the atomic rentable/sellable thing.
-- building/floor are nullable: a standalone house or a land plot
-- is a unit directly under the property.
-- -------------------------------------------------------------
create table public.units (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.properties(id),
  building_id     uuid references public.buildings(id),
  floor_id        uuid references public.floors(id),
  unit_number     text not null,                      -- "A-101"
  unit_type       public.unit_type not null,
  bedrooms        int check (bedrooms >= 0),
  bathrooms       int check (bathrooms >= 0),
  size_sqm        numeric(10,2) check (size_sqm > 0),
  base_rent       numeric(14,2) not null default 0 check (base_rent >= 0),
  rent_frequency  text not null default 'annual'
                  check (rent_frequency in ('monthly','quarterly','biannual','annual')),
  service_charge  numeric(14,2) not null default 0 check (service_charge >= 0),
  status          public.unit_status not null default 'available',
  notes           text,

  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  unique (property_id, unit_number)
);

create trigger set_updated_at before update on public.units
for each row execute function public.tg_set_updated_at();

create index idx_units_property on public.units (property_id) where deleted_at is null;
create index idx_units_status   on public.units (status) where deleted_at is null;

-- -------------------------------------------------------------
-- land_parcels — title/survey details for land-type properties
-- -------------------------------------------------------------
create table public.land_parcels (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references public.properties(id),
  parcel_number  text,
  title_type     text,                                -- C of O, deed, etc. (free text; jurisdictions vary)
  title_number   text,
  size_sqm       numeric(12,2) check (size_sqm > 0),
  survey_plan_no text,
  notes          text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create trigger set_updated_at before update on public.land_parcels
for each row execute function public.tg_set_updated_at();

-- -------------------------------------------------------------
-- photos & documents (files live in Supabase Storage; rows hold
-- the storage path + metadata)
-- -------------------------------------------------------------
create table public.property_photos (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties(id),
  unit_id       uuid references public.units(id),
  storage_path  text not null,
  caption       text,
  sort_order    int not null default 0,
  is_cover      boolean not null default false,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create trigger set_updated_at before update on public.property_photos
for each row execute function public.tg_set_updated_at();

create table public.property_documents (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties(id),
  unit_id       uuid references public.units(id),
  title         text not null,
  category      text not null default 'other'
                check (category in ('title','survey','approval','insurance','valuation','contract','other')),
  storage_path  text not null,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create trigger set_updated_at before update on public.property_documents
for each row execute function public.tg_set_updated_at();

-- -------------------------------------------------------------
-- property_managers — staff↔property assignment (drives RLS
-- scoping for property-level roles)
-- -------------------------------------------------------------
create table public.property_managers (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties(id),
  user_id       uuid not null references auth.users(id),
  note          text,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  unique (property_id, user_id)
);

create trigger set_updated_at before update on public.property_managers
for each row execute function public.tg_set_updated_at();

create index idx_property_managers_user on public.property_managers (user_id) where deleted_at is null;

-- -------------------------------------------------------------
-- Bulk unit generator — creates count units per floor with
-- pattern naming: {prefix}{floor_number}{separator}{seq}
-- e.g. prefix 'A-', floor 1, seq width 2 → A-101..A-110
-- Runs with caller's rights: RLS on units still applies.
-- -------------------------------------------------------------
create or replace function public.generate_units(
  p_floor_id uuid,
  p_prefix text,
  p_count int,
  p_unit_type public.unit_type,
  p_base_rent numeric default 0,
  p_service_charge numeric default 0,
  p_bedrooms int default null,
  p_seq_width int default 2
)
returns setof public.units
language plpgsql
as $$
declare
  v_floor public.floors%rowtype;
  v_property_id uuid;
  i int;
begin
  select * into v_floor from public.floors where id = p_floor_id and deleted_at is null;
  if not found then
    raise exception 'Floor % not found', p_floor_id;
  end if;

  select property_id into v_property_id
  from public.buildings where id = v_floor.building_id;

  for i in 1..p_count loop
    return query
    insert into public.units
      (property_id, building_id, floor_id, unit_number, unit_type,
       base_rent, service_charge, bedrooms, created_by)
    values
      (v_property_id, v_floor.building_id, p_floor_id,
       p_prefix || v_floor.floor_number::text || lpad(i::text, p_seq_width, '0'),
       p_unit_type, p_base_rent, p_service_charge, p_bedrooms, auth.uid())
    returning *;
  end loop;
end;
$$;

-- -------------------------------------------------------------
-- Portfolio stats for the executive dashboard.
-- Occupancy = occupied / (all non-unlisted, non-deleted units).
-- Respects RLS: counts only what the caller can see.
-- -------------------------------------------------------------
create or replace function public.portfolio_stats()
returns table (
  total_properties bigint,
  total_units      bigint,
  occupied_units   bigint,
  vacant_units     bigint,
  occupancy_rate   numeric
)
language sql
stable
as $$
  with u as (
    select status from public.units
    where deleted_at is null and status <> 'unlisted'
  )
  select
    (select count(*) from public.properties where deleted_at is null),
    (select count(*) from u),
    (select count(*) from u where status = 'occupied'),
    (select count(*) from u where status = 'available'),
    case when (select count(*) from u) = 0 then 0
         else round(100.0 * (select count(*) from u where status='occupied')
                    / (select count(*) from u), 1)
    end;
$$;
