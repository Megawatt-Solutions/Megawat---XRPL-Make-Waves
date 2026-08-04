-- ─────────────────────────────────────────────────────────────
-- Spreadcast production schema (Postgres).
-- Mirrors the prototype JSON store in web/src/lib/spreadcast/store.ts;
-- the web app's API routes migrate onto these tables next.
-- ─────────────────────────────────────────────────────────────

-- A player IS an XRPL r-address, proven by a server-verified Xaman sign-in.
-- name is the leaderboard nickname, chosen right after first connect (null
-- until then — the player cannot predict while it is null).
create table if not exists players (
  id          text primary key,
  wallet      text unique not null,
  name        text,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists rounds (
  delivery_day date primary key,
  opens_at     timestamptz not null,
  closes_at    timestamptz not null,
  boundaries   numeric[] not null,      -- snapshot at open (audit trail)
  status       text not null default 'open',  -- open | closed | settled
  source       text,                    -- entsoe | simulated
  resolution   text,                    -- PT15M | PT60M
  raw_values   numeric[],               -- as published
  hourly       numeric[],               -- 24 hourly means
  spread       numeric,
  outcome_band int,
  settled_at   timestamptz
);

create table if not exists predictions (
  delivery_day date not null references rounds (delivery_day),
  player_id    text not null references players (id),
  band         int  not null check (band between 0 and 4),
  exact_guess  numeric,
  salt         text not null,
  commit_hash  text not null,
  tx_hash      text,                    -- XRPL commit tx observed on-ledger; null = pick does not count
  submitted_at timestamptz not null default now(),
  -- settlement results
  correct      boolean,
  streak       int,
  multiplier   numeric,
  points       int,
  abs_error    numeric,
  primary key (delivery_day, player_id)
);
create index if not exists predictions_player_idx on predictions (player_id);
create index if not exists predictions_hash_idx on predictions (commit_hash);

create table if not exists anchors (
  week        text primary key,         -- ISO week, e.g. 2026-W30
  merkle_root text not null,
  leaves      int not null,
  tx_hash     text,
  simulated   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Every transaction observed on the anchor account — the ledger-mirrored
-- activity record (Make Waves TX counting; ledger stays source of truth).
create table if not exists chain_txs (
  tx_hash      text primary key,
  account      text not null,           -- sender
  tx_type      text not null,
  memo_type    text,
  memo_data    text,
  delivery_day date,
  ledger_index bigint,
  observed_at  timestamptz not null default now()
);
create index if not exists chain_txs_account_idx on chain_txs (account);

create table if not exists job_runs (
  id     bigserial primary key,
  job    text not null,
  ok     boolean not null,
  detail text,
  ran_at timestamptz not null default now()
);

create table if not exists meta (
  key   text primary key,
  value jsonb not null
);

-- Current band boundaries (static seed; Monday recalibration overwrites).
insert into meta (key, value)
  values ('boundaries', '[45, 75, 115, 180]')
  on conflict (key) do nothing;
