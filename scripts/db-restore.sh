#!/usr/bin/env bash
# Restores a backup written by db-backup.sh into a named, existing database with
# `pg_restore --clean --if-exists`: objects in the dump are dropped and recreated, in one
# transaction, so a failed restore leaves the database as it was.
#
#   scripts/db-restore.sh <dump-file> <database>
#
# Where the server is:
#   DATABASE_URL set    pg_restore on this host connects to that server, to <database> instead of
#                       the URL's own database (a Prisma URL works, as in db-backup.sh).
#   DATABASE_URL unset  pg_restore runs inside the compose `db` service as DB_USER (default
#                       church), reading the dump from stdin.
#
# Restoring over the live database replaces its data: stop the api service first. To check a
# backup, restore it into a new database instead (CREATE DATABASE church_restore) and point
# DATABASE_URL at that. Objects are created as the connecting user (--no-owner) without the
# source's grants (--no-privileges), so a dump also restores onto a server with other role names.
set -euo pipefail

usage() {
  echo "usage: $0 <dump-file> <database>" >&2
  exit 64
}

[[ $# -eq 2 && -n "$1" && -n "$2" ]] || usage
dump=$1
database=$2
repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

if [[ ! -f $dump || ! -r $dump ]]; then
  echo "cannot read dump file '$dump'" >&2
  exit 66
fi
if ! [[ $database =~ ^[A-Za-z_][A-Za-z0-9_-]*$ ]]; then
  echo "database name '$database' is not a plain identifier" >&2
  exit 64
fi

# shellcheck source=scripts/lib/pg-url.sh
. "$repo_root/scripts/lib/pg-url.sh"

restore_options=(--clean --if-exists --no-owner --no-privileges --single-transaction)

if [[ -n ${DATABASE_URL:-} ]]; then
  pg_url_split "$DATABASE_URL" "$database"
  pg_with_password pg_restore "${restore_options[@]}" --dbname="$PG_URL" "$dump"
else
  docker compose -f "$repo_root/docker-compose.yml" exec -T db \
    pg_restore "${restore_options[@]}" --username="${DB_USER:-church}" --dbname="$database" \
    <"$dump"
fi
echo "restored $dump into $database"
