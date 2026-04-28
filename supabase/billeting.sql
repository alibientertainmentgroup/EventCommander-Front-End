-- Billeting schema for CAP encampment
-- New hierarchy: Building -> Floor -> Room -> Bunk (bed)

-- Extensions (gen_random_uuid assumed available)

create table if not exists public.billeting_buildings (
    id uuid primary key default gen_random_uuid(),
    event_id uuid references public.events(id) on delete cascade,
    name text not null,
    gender_restriction text default 'mixed',
    created_at timestamptz default now()
);

create index if not exists billeting_buildings_event_idx on public.billeting_buildings(event_id);

create table if not exists public.billeting_floors (
    id uuid primary key default gen_random_uuid(),
    building_id uuid references public.billeting_buildings(id) on delete cascade,
    floor_number text not null,
    created_at timestamptz default now()
);

create index if not exists billeting_floors_building_idx on public.billeting_floors(building_id);

create table if not exists public.billeting_rooms (
    id uuid primary key default gen_random_uuid(),
    floor_id uuid references public.billeting_floors(id) on delete cascade,
    room_number text not null,
    bunk_capacity integer default 4,
    created_at timestamptz default now()
);

create index if not exists billeting_rooms_floor_idx on public.billeting_rooms(floor_id);

create table if not exists public.billeting_bunks (
    id uuid primary key default gen_random_uuid(),
    room_id uuid references public.billeting_rooms(id) on delete cascade,
    bunk_number text not null,
    created_at timestamptz default now()
);

create index if not exists billeting_bunks_room_idx on public.billeting_bunks(room_id);

create table if not exists public.billeting_assignments (
    id uuid primary key default gen_random_uuid(),
    event_id uuid references public.events(id) on delete cascade,
    bunk_id uuid references public.billeting_bunks(id) on delete cascade,
    cap_id text not null,
    assigned_at timestamptz default now(),
    assigned_by text
);

create index if not exists billeting_assignments_event_idx on public.billeting_assignments(event_id);
create index if not exists billeting_assignments_bunk_idx on public.billeting_assignments(bunk_id);
create index if not exists billeting_assignments_cap_idx on public.billeting_assignments(cap_id);

-- Enable RLS
alter table public.billeting_buildings enable row level security;
alter table public.billeting_floors enable row level security;
alter table public.billeting_rooms enable row level security;
alter table public.billeting_bunks enable row level security;
alter table public.billeting_assignments enable row level security;

-- Permissive policies (adjust later)
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'billeting_buildings' and policyname = 'allow_all_billeting_buildings') then
    create policy allow_all_billeting_buildings on public.billeting_buildings for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'billeting_floors' and policyname = 'allow_all_billeting_floors') then
    create policy allow_all_billeting_floors on public.billeting_floors for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'billeting_rooms' and policyname = 'allow_all_billeting_rooms') then
    create policy allow_all_billeting_rooms on public.billeting_rooms for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'billeting_bunks' and policyname = 'allow_all_billeting_bunks') then
    create policy allow_all_billeting_bunks on public.billeting_bunks for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'billeting_assignments' and policyname = 'allow_all_billeting_assignments') then
    create policy allow_all_billeting_assignments on public.billeting_assignments for all using (true) with check (true);
  end if;
end$$;
