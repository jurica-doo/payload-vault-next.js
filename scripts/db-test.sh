#!/usr/bin/env bash
# ============================================================
# Database test runner: migrations + pgTAP in a throwaway container
# ============================================================
# Runs every migration in supabase/migrations against a fresh
# supabase/postgres container, then every supabase/tests/*.test.sql file.
# Works the same locally and in CI; needs only Docker (not the Supabase CLI).
#
#   npm run test:db              # fresh container, removed afterwards
#   KEEP_DB=1 npm run test:db    # leave it running (psql on localhost:54329)
#   npm run test:db -- 010_foo   # only test files whose name contains 010_foo
#   SKIP_TESTS=1 KEEP_DB=1 …     # schema only (used by scripts/gen-types.sh)
#
# Exit code is non-zero if any migration fails or any test reports "not ok".
# ============================================================
set -euo pipefail

IMAGE="${PV_TESTDB_IMAGE:-supabase/postgres:17.11.0.007}"
NAME="${PV_TESTDB_NAME:-pv-testdb}"
PORT="${PV_TESTDB_PORT:-54329}"
FILTER="${1:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

as_admin() { docker exec -i "$NAME" psql -X -q -v ON_ERROR_STOP=1 -U supabase_admin -d postgres "$@"; }
as_postgres() { docker exec -i "$NAME" psql -X -q -v ON_ERROR_STOP=1 -U postgres -h localhost -d postgres "$@"; }

cleanup() {
  if [[ "${KEEP_DB:-0}" != "1" ]]; then
    docker rm -f "$NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "▸ starting $IMAGE as $NAME"
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres -p "$PORT:5432" "$IMAGE" >/dev/null

# The image restarts Postgres once after its init scripts, so a single
# pg_isready can succeed too early. Wait until the auth schema exists and the
# server answers twice in a row.
ready=0
for _ in $(seq 1 90); do
  if as_admin -tAc "select 1 from pg_namespace where nspname = 'auth'" 2>/dev/null | grep -q 1; then
    sleep 2
    if as_admin -tAc "select 1" >/dev/null 2>&1; then ready=1; break; fi
  fi
  sleep 1
done
[[ $ready == 1 ]] || { echo "✗ database did not become ready"; docker logs "$NAME" | tail -20; exit 1; }

echo "▸ bootstrap"
as_admin < "$ROOT/supabase/tests/_harness/bootstrap.sql"

echo "▸ migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  base="$(basename "$f" .sql)"
  version="${base%%_*}"
  name="${base#*_}"
  if ! as_postgres < "$f" >/dev/null; then
    echo "✗ migration failed: $base"
    exit 1
  fi
  as_postgres -c "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$name')" >/dev/null
  echo "  ✓ $base"
done

if [[ -f "$ROOT/supabase/seed.sql" ]]; then
  echo "▸ seed"
  as_postgres < "$ROOT/supabase/seed.sql" >/dev/null
fi

if [[ "${SKIP_TESTS:-0}" == "1" ]]; then
  echo "▸ schema ready (tests skipped)"
  exit 0
fi

echo "▸ test helpers"
as_admin < "$ROOT/supabase/tests/_harness/helpers.sql" >/dev/null

echo "▸ tests"
failed=0
total=0
shopt -s nullglob
for t in "$ROOT"/supabase/tests/*.test.sql; do
  base="$(basename "$t")"
  [[ -n "$FILTER" && "$base" != *"$FILTER"* ]] && continue
  total=$((total + 1))
  # -t -A: bare TAP lines; ON_ERROR_STOP turns SQL errors into a failure too.
  if ! out="$(as_postgres -tA < "$t" 2>&1)"; then
    echo "✗ $base (SQL error)"
    echo "$out" | sed 's/^/    /'
    failed=$((failed + 1))
    continue
  fi
  if echo "$out" | grep -qE '^not ok|^# Looks like'; then
    echo "✗ $base"
    echo "$out" | grep -E '^not ok|^#' | sed 's/^/    /'
    failed=$((failed + 1))
  else
    count="$(echo "$out" | grep -cE '^ok' || true)"
    echo "  ✓ $base ($count assertions)"
  fi
done

if [[ $total == 0 ]]; then
  echo "✗ no test files matched"
  exit 1
fi
echo "▸ $((total - failed))/$total test files passed"
[[ $failed == 0 ]]
