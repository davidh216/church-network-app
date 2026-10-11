#!/usr/bin/env bash
# Writes a PostgreSQL backup (pg_dump custom format) to a timestamped file in a target directory,
# then deletes the backups in that directory older than the retention period.
#
#   scripts/db-backup.sh <target-dir>
#
# Where the database is:
#   DATABASE_URL set    pg_dump and pg_restore (which checks the dump) run on this host and
#                       connect to it. A Prisma URL works: query parameters libpq does not know
#                       (schema, connection_limit, pgbouncer, sslaccept, ...) are dropped, and the
#                       password goes through PGPASSWORD rather than the command line (an exported
#                       PGPASSWORD or ~/.pgpass applies when the URL has none). The host's client
#                       tools must be at least the server's major version: pg_dump refuses a newer
#                       server.
#   DATABASE_URL unset  pg_dump and the check run inside the compose `db` service (docker compose
#                       exec), as DB_USER (default church) on DB_NAME (default church_dev); no
#                       client tools are needed on the host.
# Other settings:
#   RETENTION_DAYS      backups older than this many days are deleted (default 14; 0 keeps all).
#                       Only files named exactly as this script names them are deleted, plus
#                       <prefix>-*.dump.partial left by an interrupted run more than a day ago.
#   BACKUP_PREFIX       file name prefix (default church): <prefix>-<UTC timestamp>.dump
#
# Restore with scripts/db-restore.sh. Nightly from cron, for example:
#   15 2 * * * cd /srv/church-network-app && scripts/db-backup.sh /var/backups/church >> /var/log/church-backup.log 2>&1
set -euo pipefail

usage() {
  echo "usage: $0 <target-dir>" >&2
  exit 64
}

[[ $# -eq 1 && -n "$1" ]] || usage
target_dir=$1
if [[ $target_dir == -* ]]; then
  echo "the target directory must not start with '-' (write ./$target_dir)" >&2
  exit 64
fi
retention_days=${RETENTION_DAYS:-14}
prefix=${BACKUP_PREFIX:-church}
repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

if ! [[ $retention_days =~ ^[0-9]+$ ]]; then
  echo "RETENTION_DAYS must be a whole number of days, got '$retention_days'" >&2
  exit 64
fi
if ! [[ $prefix =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "BACKUP_PREFIX may only contain letters, digits, dot, dash and underscore" >&2
  exit 64
fi

# shellcheck source=scripts/lib/pg-url.sh
. "$repo_root/scripts/lib/pg-url.sh"

# Backups hold personal data and password hashes: readable by their owner only.
umask 077
mkdir -p -- "$target_dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="$target_dir/$prefix-$stamp.dump"
# Written under a temporary name and renamed when complete, so an interrupted run never leaves a
# file that looks like a finished backup (or gets restored as one).
partial="$file.partial"
trap 'rm -f -- "$partial"' EXIT

# After the dump, pg_restore reads its table of contents: an unreadable dump fails here, not on
# restore day. It runs where pg_dump ran, so it can read what that pg_dump version wrote.
if [[ -n ${DATABASE_URL:-} ]]; then
  pg_url_split "$DATABASE_URL"
  pg_with_password pg_dump --format=custom --file="$partial" --dbname="$PG_URL"
  pg_restore --list "$partial" >/dev/null
else
  compose=(docker compose -f "$repo_root/docker-compose.yml")
  "${compose[@]}" exec -T db \
    pg_dump --format=custom --username="${DB_USER:-church}" --dbname="${DB_NAME:-church_dev}" \
    >"$partial"
  "${compose[@]}" exec -T db pg_restore --list <"$partial" >/dev/null
fi
mv -- "$partial" "$file"
trap - EXIT
echo "backup written: $file ($(wc -c <"$file" | tr -d ' ') bytes)"

# -mtime +N matches files last modified more than N whole days ago. Only names this script
# generates match, so other files kept in the directory are never deleted.
digits8='[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
digits6='[0-9][0-9][0-9][0-9][0-9][0-9]'
if ((retention_days > 0)); then
  find "$target_dir" -maxdepth 1 -type f -name "$prefix-${digits8}T${digits6}Z.dump" \
    -mtime +"$retention_days" -print -delete | sed 's/^/deleted old backup: /'
fi
find "$target_dir" -maxdepth 1 -type f -name "$prefix-*.dump.partial" -mtime +0 \
  -print -delete | sed 's/^/deleted stale partial backup: /'
