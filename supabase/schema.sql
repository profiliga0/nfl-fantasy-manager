create extension if not exists pgcrypto;

create table if not exists leagues (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  season int not null,
  max_players int not null default 4,
  created_at timestamptz not null default now()
);

create table if not exists managers (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  name text not null,
  pin_hash text not null,
  pin_salt text not null,
  created_at timestamptz not null default now(),
  unique(league_id, name)
);

create table if not exists sessions (
  token_hash text primary key,
  manager_id uuid not null references managers(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists players (
  player_id text primary key,
  name text not null,
  first_name text,
  last_name text,
  position text,
  team text,
  active boolean default false,
  fantasy_positions jsonb default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists teams (
  code text primary key,
  name text not null,
  updated_at timestamptz not null default now()
);

create table if not exists schedules (
  season int not null,
  week int not null,
  game_id text not null,
  starts_at timestamptz not null,
  home text not null,
  away text not null,
  status text,
  primary key(season,game_id)
);

create table if not exists weekly_player_stats (
  season int not null,
  week int not null,
  player_id text not null,
  team text,
  raw_stats jsonb not null default '{}'::jsonb,
  fantasy_points numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key(season,week,player_id)
);

create table if not exists weekly_team_stats (
  season int not null,
  week int not null,
  team text not null,
  pass_yards numeric default 0,
  pass_tds numeric default 0,
  pass_2pt numeric default 0,
  pass_fumbles numeric default 0,
  rush_yards numeric default 0,
  rush_tds numeric default 0,
  rush_2pt numeric default 0,
  rush_fumbles numeric default 0,
  rec_yards numeric default 0,
  rec_tds numeric default 0,
  def_points_allowed numeric default 0,
  def_interceptions numeric default 0,
  def_fumbles numeric default 0,
  sacks numeric default 0,
  safeties numeric default 0,
  def_tds numeric default 0,
  pats numeric default 0,
  fg_0_49 numeric default 0,
  fg_50_plus numeric default 0,
  return_tds numeric default 0,
  updated_at timestamptz not null default now(),
  primary key(season,week,team)
);

create table if not exists lineups (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  manager_id uuid not null references managers(id) on delete cascade,
  season int not null,
  week int not null,
  qb text,
  rb text,
  wr text,
  pass_team text,
  rush_team text,
  defense_team text,
  st_team text,
  captain text,
  submitted_at timestamptz,
  auto_copied boolean not null default false,
  locked_at timestamptz,
  unique(league_id,manager_id,season,week)
);

create table if not exists app_meta (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Lock direct table access. All mutations and reads go through the Edge Function.
alter table leagues enable row level security;
alter table managers enable row level security;
alter table sessions enable row level security;
alter table players enable row level security;
alter table teams enable row level security;
alter table schedules enable row level security;
alter table weekly_player_stats enable row level security;
alter table weekly_team_stats enable row level security;
alter table lineups enable row level security;
alter table app_meta enable row level security;

create index if not exists idx_players_pos_team on players(position,team);
create index if not exists idx_lineups_week on lineups(league_id,season,week);
create index if not exists idx_schedule_week on schedules(season,week,starts_at);
create index if not exists idx_stats_week_team on weekly_player_stats(season,week,team);
