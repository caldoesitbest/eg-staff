-- Envious Glider 4.7: the server side of buying Sigils (the "Get Sigils" store). Run this once in the Supabase SQL
-- editor (Dashboard -> SQL Editor -> New query -> paste -> Run). Running it again is safe. It adds three new tables
-- and two functions and changes nothing that already exists. The store stays switched off (and hidden in the game)
-- until you turn it on at the bottom of docs/SIGIL_STORE.md, after Stripe is set up.

-- ------------------------------------------------------------------------------------------------------------
-- The packs for sale. The price and the Sigils come from here, never from the game, so nobody can change them.
-- cents is the price in the smallest unit of `currency` (199 = $1.99).
-- ------------------------------------------------------------------------------------------------------------
create table if not exists public.game_sigil_packs (
  id text primary key check (id ~ '^[a-z0-9_]{1,24}$'),
  name text not null,
  sigils integer not null check (sigils > 0 and sigils <= 100000),
  cents integer not null check (cents >= 50 and cents <= 100000),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  active boolean not null default true,
  sort integer not null default 0
);
alter table public.game_sigil_packs enable row level security;
revoke all on public.game_sigil_packs from anon, authenticated;

-- About 250 Sigils a dollar, a little more on the bigger packs (+4%, +12%, +19%). An Epic item is 600 Sigils.
insert into public.game_sigil_packs (id, name, sigils, cents, sort) values
  ('pouch', 'Pouch', 500, 199, 1),
  ('stack', 'Stack', 1300, 499, 2),
  ('chest', 'Chest', 2800, 999, 3),
  ('vault', 'Vault', 6000, 1999, 4)
on conflict (id) do nothing;

-- ------------------------------------------------------------------------------------------------------------
-- The store's switch and the monthly limit per player (in cents, over the last 30 days).
-- ------------------------------------------------------------------------------------------------------------
create table if not exists public.game_sigil_config (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  month_cap_cents integer not null default 5000 check (month_cap_cents >= 0)
);
alter table public.game_sigil_config enable row level security;
revoke all on public.game_sigil_config from anon, authenticated;
insert into public.game_sigil_config (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------------------------------------------------------------
-- Orders: one row per Stripe Checkout. The sigil-checkout function adds it (pending); the sigil-webhook function
-- marks it paid when Stripe says so, and refunded or disputed if the money goes back. Players can't touch it.
-- ------------------------------------------------------------------------------------------------------------
create table if not exists public.game_sigil_orders (
  session_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  pack text not null,
  sigils integer not null check (sigils > 0),
  cents integer not null check (cents > 0),
  currency text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'disputed', 'expired')),
  payment_intent text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists game_sigil_orders_user on public.game_sigil_orders (user_id, created_at desc);
create index if not exists game_sigil_orders_pi on public.game_sigil_orders (payment_intent);
alter table public.game_sigil_orders enable row level security;
revoke all on public.game_sigil_orders from anon, authenticated;

-- ------------------------------------------------------------------------------------------------------------
-- What the game reads.
-- ------------------------------------------------------------------------------------------------------------
-- The store: whether it's open, the monthly limit, and the packs.
create or replace function public.game_sigil_store()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'on', coalesce((select c.enabled from public.game_sigil_config c where c.id = 1), false),
    'cap', coalesce((select c.month_cap_cents from public.game_sigil_config c where c.id = 1), 0),
    'packs', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'sigils', p.sigils, 'cents', p.cents, 'currency', p.currency) order by p.sort, p.cents)
                       from public.game_sigil_packs p where p.active), '[]'::jsonb)
  );
$$;

-- The signed-in player's paid Sigils (paid orders; refunded and disputed ones don't count) and their recent orders.
create or replace function public.game_sigils_bought()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', coalesce((select sum(o.sigils) from public.game_sigil_orders o where o.user_id = auth.uid() and o.status = 'paid'), 0),
    'month', coalesce((select sum(o.cents) from public.game_sigil_orders o where o.user_id = auth.uid() and o.status = 'paid' and o.paid_at > now() - interval '30 days'), 0),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('sigils', x.sigils, 'cents', x.cents, 'currency', x.currency, 'status', x.status, 'at', coalesce(x.paid_at, x.created_at)) order by x.created_at desc)
                        from (select * from public.game_sigil_orders o where o.user_id = auth.uid() and o.status <> 'expired' and (o.status <> 'pending' or o.created_at > now() - interval '1 hour')
                              order by o.created_at desc limit 20) x), '[]'::jsonb)
  );
$$;

revoke all on function public.game_sigil_store() from public;
revoke all on function public.game_sigils_bought() from public, anon;
grant execute on function public.game_sigil_store() to anon, authenticated;
grant execute on function public.game_sigils_bought() to authenticated;
