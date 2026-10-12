# shellcheck shell=bash disable=SC2034
# (SC2034: PG_URL and PG_URL_PASSWORD are set here for the scripts that source this file.)
# Sourced by db-backup.sh and db-restore.sh.
#
# pg_url_split <url> [database]
# Turns a Prisma-style PostgreSQL URL into one the PostgreSQL client tools accept:
#   PG_URL           the URL without its password, with its database replaced by <database> when
#                    given, and with only the query parameters libpq knows (PG_URL_KEYS); libpq
#                    rejects the rest, such as Prisma's schema, connection_limit, pool_timeout,
#                    pgbouncer or sslaccept. Prisma's sslaccept=strict turns sslmode=require or
#                    prefer into verify-full, as the API reads it (sslaccept=accept_invalid_certs
#                    leaves sslmode as it is).
#   PG_URL_PASSWORD  the password, percent-decoded (empty when the URL has none), for PGPASSWORD
#                    (see pg_with_password), so it never appears in a process listing. A
#                    password= query parameter is taken out of the URL and wins over the one
#                    before the @, as in libpq and the API.
PG_URL_KEYS='user passfile service sslmode sslrootcert sslcert sslkey sslcrl sslpassword sslsni sslnegotiation ssl_min_protocol_version ssl_max_protocol_version require_auth host hostaddr port application_name options target_session_attrs connect_timeout channel_binding gssencmode'

pg_url_split() {
  local url=$1 database=${2:-} query='' param key value kept='' rest userinfo='' hostpart path
  local sslaccept=''
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
      [[ ${param%%=*} == sslaccept ]] && sslaccept=${param#*=}
    done
    for param in "${params[@]}"; do
      key=${param%%=*}
      value=''
      [[ $param == *=* ]] && value=${param#*=}
      if [[ $key == password ]]; then
        # Decoded as a query value ('+' is a space), as the API's driver reads it.
        [[ -n $value ]] && PG_URL_PASSWORD=$(pg_url_decode "${value//+/ }")
        continue
      fi
      pg_url_key_allowed "$key" || continue
      if [[ $key == sslmode && $sslaccept == strict && ($value == require || $value == prefer) ]]; then
        param='sslmode=verify-full'
      fi
      kept+="${kept:+&}$param"
    done
  fi

  PG_URL="postgresql://${userinfo:+$userinfo@}$hostpart/$path${kept:+?$kept}"
}

# Whether libpq accepts the query parameter <key>: PG_URL_KEYS and keepalives*.
pg_url_key_allowed() {
  local key=$1 allowed
  [[ $key == keepalives || $key == keepalives_* ]] && return 0
  for allowed in $PG_URL_KEYS; do
    [[ $key == "$allowed" ]] && return 0
  done
  return 1
}

# pg_with_password <command> [args...]
# Runs the command with PGPASSWORD set to the URL's password when the URL has one; otherwise
# leaves the environment alone, so an exported PGPASSWORD or ~/.pgpass still applies.
pg_with_password() {
  if [[ -n $PG_URL_PASSWORD ]]; then
    PGPASSWORD=$PG_URL_PASSWORD "$@"
  else
    "$@"
  fi
}

# Percent-decodes a URL component (%40 -> @).
pg_url_decode() {
  local escaped=${1//\\/\\\\}
  printf '%b' "${escaped//%/\\x}"
}
