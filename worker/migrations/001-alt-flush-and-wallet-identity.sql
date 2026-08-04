-- ─────────────────────────────────────────────────────────────
-- 001-alt: wallet-first identity, starting from an empty player table.
--
-- AN ALTERNATIVE TO 001-wallet-identity.sql, NOT A SEQUEL. Run exactly
-- one of the two, once. Running this after 001 fails on the first
-- `alter table ... drop column` — the column is already gone — and the
-- whole thing rolls back, which is the intended outcome rather than a
-- half-applied schema.
--
--   001-wallet-identity.sql  keeps every player who has a wallet, and
--                            deletes only those who cannot be migrated.
--                            Use when the live players are real.
--   this file                deletes every player and every prediction,
--                            then applies the same schema change. Use
--                            when the player table is test data from
--                            your own sessions and a clean slate is
--                            wanted — 001 would preserve the wallet-
--                            bearing test accounts, which is the
--                            opposite of a clean slate.
--
-- Run ONCE against the live database, e.g.:
--   psql "$DATABASE_URL" -f migrations/001-alt-flush-and-wallet-identity.sql
-- schema.sql only does "create table if not exists" and never alters a
-- live table, so a migration file is the only path for an existing
-- database. schema.sql already describes the POST-migration shape, and
-- is what a fresh database gets; neither file is needed there.
--
-- The deployed worker must be the wallet-identity version BEFORE this
-- runs. The previous worker reads players.email and players.verified in
-- nineteen places and starts erroring the moment they are dropped, and
-- the web app calls findOrCreatePlayerByWallet and setPlayerName, which
-- the previous worker does not implement. Stop the worker, deploy, run
-- this, start it.
-- ─────────────────────────────────────────────────────────────

begin;

-- Both tables are named, so no CASCADE is needed and nothing spreads
-- beyond them. That is the point: `predictions` is the only table with a
-- foreign key to `players`, so `anchors` and `chain_txs` are untouched.
-- chain_txs mirrors what is on the ledger and the ledger does not forget,
-- so a local table that disagrees with it would be worse than useless.
-- `rounds` also survives, so market history and settled days remain — the
-- flush costs you who predicted what, not what the market did.
truncate predictions, players;

-- Identical to the tail of 001. A player IS an r-address: wallet becomes
-- the identity and gains the unique constraint the new model relies on,
-- name becomes a nullable nickname answered after connecting, and email
-- and verified are dropped — email proves nothing about who is picking,
-- and verified drew a distinction that no longer exists now that every
-- player has proved a wallet.
alter table players drop column email;
alter table players drop column verified;
alter table players alter column name drop not null;
alter table players alter column wallet set not null;
alter table players add constraint players_wallet_key unique (wallet);

commit;
