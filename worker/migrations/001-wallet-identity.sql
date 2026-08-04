-- ─────────────────────────────────────────────────────────────
-- 001-wallet-identity: move the live droplet database to wallet-first
-- identity (a player IS an XRPL r-address; email is gone; name is a
-- nullable nickname).
--
-- Run ONCE against the live database, e.g.:
--   psql "$DATABASE_URL" -f migrations/001-wallet-identity.sql
-- schema.sql only does "create table if not exists" and never alters a
-- live table, so this file is the only path for an existing database.
--
-- Rows with no wallet CANNOT be migrated: without an r-address there is
-- nothing to prove ownership with under the new model. Those players and
-- their predictions are DELETED below. If two old email accounts linked
-- the same wallet, the oldest row (created_at, then id) is kept and the
-- newer duplicates and their predictions are DELETED — otherwise the
-- unique(wallet) constraint cannot be added.
-- ─────────────────────────────────────────────────────────────

begin;

-- Email-only players: no wallet, no provable identity — remove them.
delete from predictions
 where player_id in (select id from players where wallet is null);
delete from players where wallet is null;

-- Duplicate wallets: keep the oldest player row per wallet.
delete from predictions
 where player_id in (
   select p.id from players p
    where exists (
      select 1 from players o
       where o.wallet = p.wallet
         and (o.created_at < p.created_at
              or (o.created_at = p.created_at and o.id < p.id))
    )
 );
delete from players p
 where exists (
   select 1 from players o
    where o.wallet = p.wallet
      and (o.created_at < p.created_at
           or (o.created_at = p.created_at and o.id < p.id))
 );

alter table players drop column email;
alter table players drop column verified;
alter table players alter column name drop not null;
alter table players alter column wallet set not null;
alter table players add constraint players_wallet_key unique (wallet);

commit;
