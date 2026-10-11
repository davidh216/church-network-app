# shellcheck shell=bash disable=SC2034
# (SC2034: PG_URL and PG_URL_PASSWORD are set here for the scripts that source this file.)
# Sourced by db-backup.sh and db-restore.sh.
#
# pg_url_split <url> [database]
# Turns a Prisma-style PostgreSQL URL into one the PostgreSQL client tools accept:
#   PG_URL           the URL without its password and without the `schema` query parameter
#                    (libpq rejects it), and with its database replaced by <database> when given
#   PG_URL_PASSWORD  the password, percent-decoded (empty when the URL has none), for PGPASSWORD,
#                    so it never appears in a process listing
pg_url_split() {
  local url=$1 database=${2:-} query='' param kept='' rest userinfo='' hostpart path
  local -a params
  if [[ $url == *\?* ]]; then
    query=${url#*\?}
    url=${url%%\?*}
  fi
  if [[ $url =~ ^(postgres|postgresql)://(.*)$ ]]; then
    rest=${BASH_REMATCH[2]}
  else
    echo "DATABASE_URL must start with postgresql:// or postgres://" >&2
    return 64
  fi
  if [[ $rest == *@* ]]; then
    userinfo=${rest%@*}
    rest=${rest##*@}
  fi
  hostpart=${rest%%/*}
  path=''
  [[ $rest == */* ]] && path=${rest#*/}
  [[ -n $database ]] && path=$database

  PG_URL_PASSWORD=''
  if [[ $userinfo == *:* ]]; then
    PG_URL_PASSWORD=$(pg_url_decode "${userinfo#*:}")
    userinfo=${userinfo%%:*}
  fi

  if [[ -n $query ]]; then
    IFS='&' read -r -a params <<<"$query"
    for param in "${params[@]}"; do
      [[ -z $param || $param == schema=* ]] && continue
      kept+="${kept:+&}$param"
    done
  fi

  PG_URL="postgresql://${userinfo:+$userinfo@}$hostpart/$path${kept:+?$kept}"
}

# Percent-decodes a URL component (%40 -> @).
pg_url_decode() {
  local escaped=${1//\\/\\\\}
  printf '%b' "${escaped//%/\\x}"
}
