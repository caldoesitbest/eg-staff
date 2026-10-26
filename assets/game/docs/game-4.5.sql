-- Envious Glider 4.5: the server side of cloud saves, difficulty leaderboards, and the co-op and Boss Rush boards.
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> paste -> Run). Running it again
-- is safe. It adds two new tables and four functions; it doesn't change or read anything that already exists
-- (except public.profiles, for names on the boards). Until it's run, the game works as before: saves stay on each
-- device and the leaderboard shows the original board.

-- ------------------------------------------------------------------------------------------------------------
-- Cloud saves: one private row per player. Nobody can read or write the table directly; the two functions only
-- ever touch the signed-in player's own row.
-- ------------------------------------------------------------------------------------------------------------
create table if not exists public.game_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  rev integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.game_saves enable row level security;
revoke all on public.game_saves from anon, authenticated;

create or replace function public.game_save_get()
returns table (data jsonb, rev integer, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.data, s.rev, s.updated_at from public.game_saves s where s.user_id = auth.uid();
$$;

-- p_rev must be newer than what's stored (two devices saving at once: the second merges and tries again)
create or replace function public.game_save_put(p_data jsonb, p_rev integer)
returns table (ok boolean, rev integer)
language plpgsql security definer set search_path = public as $$
declare cur integer;
begin
  if auth.uid() is null then return query select false, 0; return; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or pg_column_size(p_data) > 131072 then
    raise exception 'bad save';
  end if;
  select s.rev into cur from public.game_saves s where s.user_id = auth.uid() for update;
  if cur is not null and p_rev <= cur then return query select false, cur; return; end if;
  insert into public.game_saves as s (user_id, data, rev, updated_at) values (auth.uid(), p_data, p_rev, now())
    on conflict (user_id) do update set data = excluded.data, rev = excluded.rev, updated_at = now();
  return query select true, p_rev;
end $$;

revoke all on function public.game_save_get() from public, anon;
revoke all on function public.game_save_put(jsonb, integer) from public, anon;
grant execute on function public.game_save_get() to authenticated;
grant execute on function public.game_save_put(jsonb, integer) to authenticated;

-- ------------------------------------------------------------------------------------------------------------
-- Runs, for the boards: the Sin Ladder, the Daily, Boss Rush and co-op, each by difficulty.
-- ------------------------------------------------------------------------------------------------------------
create table if not exists public.game_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('ladder', 'daily', 'rush', 'coop')),
  difficulty text not null check (difficulty in ('normal', 'hard', 'nightmare')),
  score bigint not null check (score >= 0 and score < 100000000000),
  wave integer not null default 0 check (wave >= 0 and wave < 10000),
  won boolean not null default false,
  seconds integer not null default 0 check (seconds >= 0),
  daily date,
  team text,
  players smallint not null default 1 check (players between 1 and 4),
  client text,
  created_at timestamptz not null default now()
);
create index if not exists game_runs_board on public.game_runs (mode, difficulty, score desc);
create index if not exists game_runs_user on public.game_runs (user_id, created_at desc);
alter table public.game_runs enable row level security;
revoke all on public.game_runs from anon, authenticated;

create or replace function public.submit_game_run(p_mode text, p_difficulty text, p_score bigint, p_wave integer, p_won boolean,
  p_seconds integer, p_daily date, p_team text, p_players integer, p_client text)
returns table (ok boolean, rank bigint)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); recent integer;
begin
  if uid is null then return query select false, null::bigint; return; end if;
  -- flood control: 30 runs an hour per player is plenty
  select count(*) into recent from public.game_runs where user_id = uid and created_at > now() - interval '1 hour';
  if recent >= 30 then return query select false, null::bigint; return; end if;
  insert into public.game_runs (user_id, mode, difficulty, score, wave, won, seconds, daily, team, players, client)
  values (uid, p_mode, p_difficulty, greatest(0, p_score), greatest(0, coalesce(p_wave, 0)), coalesce(p_won, false),
          greatest(0, coalesce(p_seconds, 0)), case when p_mode = 'daily' then p_daily else null end,
          left(p_team, 120), least(4, greatest(1, coalesce(p_players, 1))), left(p_client, 40));
  return query select true, (
    select count(*) + 1 from (
      select max(r.score) as best from public.game_runs r
      where r.mode = p_mode and r.difficulty = p_difficulty and (p_mode <> 'daily' or r.daily = p_daily)
      group by r.user_id
    ) t where t.best > p_score);
end $$;

-- best run per player (per difficulty, or all of them), with the player's name
create or replace function public.game_board(p_mode text, p_difficulty text, p_daily date, p_limit integer)
returns table (rank bigint, username text, score bigint, wave integer, won boolean, seconds integer, difficulty text,
               team text, players smallint, created_at timestamptz, is_me boolean)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (r.user_id) r.*
    from public.game_runs r
    where r.mode = p_mode
      and (p_difficulty is null or r.difficulty = p_difficulty)
      and (p_mode <> 'daily' or r.daily = coalesce(p_daily, current_date))
    order by r.user_id, r.score desc, r.created_at asc
  )
  select row_number() over (order by b.score desc, b.created_at asc), coalesce(p.username, 'Pilot'), b.score, b.wave, b.won,
         b.seconds, b.difficulty, b.team, b.players, b.created_at, b.user_id = auth.uid()
  from best b left join public.profiles p on p.id = b.user_id
  order by b.score desc, b.created_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.submit_game_run(text, text, bigint, integer, boolean, integer, date, text, integer, text) from public, anon;
grant execute on function public.submit_game_run(text, text, bigint, integer, boolean, integer, date, text, integer, text) to authenticated;
grant execute on function public.game_board(text, text, date, integer) to anon, authenticated;
