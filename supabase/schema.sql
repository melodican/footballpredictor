-- World Cup 2026 Family Predictor
-- Run this in your Supabase SQL editor

-- Participants
create table participants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  winner_pick text not null,
  top_scorer_pick text not null,
  submitted_at timestamptz default now()
);

-- Predictions (one per participant per fixture)
create table predictions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid references participants(id) on delete cascade not null,
  fixture_id text not null,   -- matches id in fixtures.ts e.g. "A1", "B3"
  home_score integer not null check (home_score >= 0),
  away_score integer not null check (away_score >= 0),
  is_joker boolean not null default false,
  created_at timestamptz default now(),
  unique (participant_id, fixture_id)
);

-- Results (entered by admin)
create table results (
  id uuid primary key default gen_random_uuid(),
  fixture_id text not null unique,
  home_score integer not null check (home_score >= 0),
  away_score integer not null check (away_score >= 0),
  entered_at timestamptz default now()
);

-- Tournament settings (single row, id = 1)
create table tournament_settings (
  id integer primary key default 1,
  entries_open boolean not null default true,
  predictions_revealed boolean not null default false,
  current_phase text not null default 'group',
  updated_at timestamptz default now()
);

-- Seed settings row
insert into tournament_settings (id) values (1);

-- Enable real-time on the tables the dashboard subscribes to
alter publication supabase_realtime add table results;
alter publication supabase_realtime add table participants;
alter publication supabase_realtime add table tournament_settings;

-- Row Level Security — allow anonymous reads and inserts
-- (tighten these once you add auth if needed)

alter table participants enable row level security;
alter table predictions enable row level security;
alter table results enable row level security;
alter table tournament_settings enable row level security;

-- Participants: anyone can insert (submit entry), only revealed if predictions_revealed
create policy "anyone can submit" on participants for insert to anon with check (true);
create policy "anyone can read" on participants for select to anon using (true);

-- Predictions: anyone can insert their own, read all (filtered by app)
create policy "anyone can insert predictions" on predictions for insert to anon with check (true);
create policy "anyone can read predictions" on predictions for select to anon using (true);

-- Results: read-only for public
create policy "anyone can read results" on results for select to anon using (true);
create policy "anon can insert results" on results for insert to anon with check (true);
create policy "anon can update results" on results for update to anon using (true);

-- Tournament settings: read-only for public
create policy "anyone can read settings" on tournament_settings for select to anon using (true);
create policy "anon can update settings" on tournament_settings for update to anon using (true);
