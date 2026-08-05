#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Deploy the Spreadcast worker to the droplet, and run any pending
# migration.
#
# WHY THIS FILE EXISTS
#
# The app deploys to two places and only one of them deploys itself:
#
#   web/     -> Vercel, automatically, the moment main changes
#   worker/  -> this droplet, only when someone runs this
#
# On 4 August 2026 the wallet-identity change was merged. Vercel shipped
# the new front end within the minute; the worker stayed as it was; and
# "Connect XRPL wallet" answered "unknown method
# findOrCreatePlayerByWallet" on a phone in production. Nothing was
# broken — the two halves simply disagreed, because merging updates one
# of them and nothing updates the other.
#
# Any change under worker/ has to be followed by this script. A change
# that touches worker/ AND web/ has to be sequenced: worker first, then
# let Vercel take the web app, or the same gap opens again.
#
# USAGE, on the droplet as root:
#
#   git clone https://github.com/Megawatt-Solutions/Megawat---XRPL-Make-Waves.git /tmp/mw
#   bash /tmp/mw/worker/deploy.sh
#
# Or from an existing checkout:  REPO=/path/to/checkout bash worker/deploy.sh
#
# It backs up the worker binary and the whole database to /root before
# touching either, refuses to run against a checkout that does not look
# like the new worker, skips the migration if it has already been
# applied, and prints the rollback commands when it finishes.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

# Default to the checkout this script is being run from.
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO="${REPO:-$(dirname "$HERE")}"
DEST=/opt/spreadcast/worker
ENVFILE=/etc/spreadcast/worker.env
STAMP=$(date +%F-%H%M%S)

# Which migration to apply. -alt flushes the player table; the plain one
# preserves every player who already has a wallet. They are alternatives:
# run one, ever. See the header of either file.
MIGRATION="${MIGRATION:-001-alt-flush-and-wallet-identity.sql}"

echo "==> checking the checkout at $REPO"
SRC="$REPO/worker/index.mjs"
MIG="$REPO/worker/migrations/$MIGRATION"
[ -f "$SRC" ] || { echo "FAIL: $SRC not found. Pass REPO=/path/to/checkout"; exit 1; }
[ -f "$MIG" ] || { echo "FAIL: migration not found at $MIG"; exit 1; }

# The old worker reads players.email and players.verified in ~19 places;
# the wallet-identity worker mentions them once, in a comment. Deploying
# the old one over the new schema is the failure this guard exists for.
N=$(grep -c "email\|verified" "$SRC" || true)
[ "$N" -le 3 ] || { echo "FAIL: $SRC looks like the OLD worker (email/verified x$N). Wrong branch?"; exit 1; }
grep -q "findOrCreatePlayerByWallet" "$SRC" || { echo "FAIL: $SRC has no findOrCreatePlayerByWallet"; exit 1; }
echo "    ok, this is the wallet-identity worker"

echo "==> reading $ENVFILE"
[ -r "$ENVFILE" ] || { echo "FAIL: cannot read $ENVFILE (run as root)"; exit 1; }
set -a; . "$ENVFILE"; set +a
[ -n "${DATABASE_URL:-}" ] || { echo "FAIL: DATABASE_URL not set by $ENVFILE"; exit 1; }

echo "==> stopping the worker"
systemctl stop spreadcast-worker

echo "==> backing up to /root"
[ -f "$DEST/index.mjs" ] && cp "$DEST/index.mjs" "/root/index.mjs.$STAMP.bak"
# Dump through DATABASE_URL, not a database name written here. This line
# used to read `sudo -u postgres pg_dump spreadcast`, which guessed the
# database was called "spreadcast" from worker.env.example — a file whose
# password field says CHANGE_ME, i.e. one that announces its values are not
# the real ones. It also assumed a postgres superuser reachable by peer
# auth. The connection string the worker itself uses is the only thing here
# that is known to be true, and it is already loaded above.
pg_dump "$DATABASE_URL" > "/root/spreadcast-$STAMP.sql"
# set -e covers a non-zero exit, but a dump that "succeeds" into an empty
# file is the failure that matters: it is only discovered when someone
# reaches for it after the migration has already run.
[ -s "/root/spreadcast-$STAMP.sql" ] || { echo "FAIL: database backup is empty — refusing to migrate"; exit 1; }
echo "    /root/index.mjs.$STAMP.bak"
echo "    /root/spreadcast-$STAMP.sql ($(wc -c < "/root/spreadcast-$STAMP.sql") bytes)"

echo "==> installing"
install -o spreadcast -g spreadcast -m 0644 "$SRC" "$DEST/index.mjs"
install -d -o spreadcast -g spreadcast -m 0755 "$DEST/migrations"
install -o spreadcast -g spreadcast -m 0644 "$MIG" "$DEST/migrations/"

echo "==> migration"
# schema.sql only ever does "create table if not exists" and never alters
# a live table, so a migration file is the only path for this database.
# players.email is the tell: present means 001 has not run yet.
HAS_EMAIL=$(psql "$DATABASE_URL" -tAc \
  "select count(*) from information_schema.columns where table_name='players' and column_name='email';")
if [ "$HAS_EMAIL" = "0" ]; then
  echo "    already applied (players.email is gone) - skipping"
else
  echo "    applying $MIGRATION"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$DEST/migrations/$MIGRATION"
  echo "    done"
fi

echo "==> starting the worker"
systemctl start spreadcast-worker
sleep 3
if ! systemctl is-active --quiet spreadcast-worker; then
  echo "FAIL: worker did not start"
  journalctl -u spreadcast-worker -n 30 --no-pager
  exit 1
fi

echo "==> checking the RPC surface"
RESP=$(curl -s --max-time 10 -X POST http://localhost:8787/rpc \
  -H "Authorization: Bearer ${SPREADCAST_API_TOKEN:-}" \
  -H "Content-Type: application/json" \
  -d '{"method":"getUser","params":{"id":"__deploy_probe__"}}' || true)
echo "    getUser -> ${RESP:-<no response>}"
case "$RESP" in
  *"unknown method"*) echo "FAIL: the running worker does not know its own methods"; exit 1;;
  "")                 echo "WARN: no response from :8787 — check SPREADCAST_API_TOKEN";;
esac

cat <<EOF

DONE. Open app.megawatt.solutions and tap "Connect XRPL wallet".

Roll back the worker:
  cp /root/index.mjs.$STAMP.bak $DEST/index.mjs && systemctl restart spreadcast-worker

Restore the database (undoes the migration, including the player flush):
  systemctl stop spreadcast-worker
  psql "\$DATABASE_URL" < /root/spreadcast-$STAMP.sql
  systemctl start spreadcast-worker
EOF
