-- ---------------------------------------------------------------------
-- Re-run safety. Some steps below still mention a few old CricketData settings that the last step removes.
-- If this file was run before, those settings are gone; put them back briefly so every step runs,
-- and the last step removes them again. (On a first run this changes nothing.)
-- ---------------------------------------------------------------------
alter table public.app_settings
  add column if not exists daily_credit_cap int not null default 90,
  add column if not exists list_refresh_hours int not null default 6,
  add column if not exists fixtures_refresh_hours int not null default 24,
  add column if not exists fixtures_pages int not null default 8,
  add column if not exists only_game_ready boolean not null default true,
  add column if not exists auto_xi_check boolean not null default false,
  add column if not exists live_scores boolean not null default true,
  add column if not exists live_score_minutes int not null default 30,
  add column if not exists data_source text not null default 'cricbuzz';
alter table public.matches add column if not exists squad_attempted_at timestamptz;
