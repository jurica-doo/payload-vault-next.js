#!/usr/bin/env bash
# ============================================================
# Regenerate src/types/supabase.ts from the migrations
# ============================================================
# Equivalent to `supabase gen types typescript --local`, which needs the full
# Supabase CLI stack. Instead: build the schema with scripts/db-test.sh and ask
# postgres-meta (the service the CLI itself uses) for the TypeScript output.
#
#   npm run types
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
META_IMAGE="${PV_META_IMAGE:-supabase/postgres-meta:v0.99.0}"
META_NAME="pv-types-meta"
DB_NAME="pv-types-db"
DB_PORT="54330"
META_PORT="54331"

cleanup() {
  docker rm -f "$META_NAME" "$DB_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

PV_TESTDB_NAME="$DB_NAME" PV_TESTDB_PORT="$DB_PORT" SKIP_TESTS=1 KEEP_DB=1 \
  bash "$ROOT/scripts/db-test.sh" >/dev/null

docker run -d --name "$META_NAME" -p "$META_PORT:8080" \
  --add-host=host.docker.internal:host-gateway \
  -e PG_META_DB_URL="postgresql://postgres:postgres@host.docker.internal:$DB_PORT/postgres" \
  "$META_IMAGE" >/dev/null

for _ in $(seq 1 30); do
  curl -sf "http://127.0.0.1:$META_PORT/health" >/dev/null 2>&1 && break
  sleep 1
done

out="$(mktemp)"
curl -sf "http://127.0.0.1:$META_PORT/generators/typescript?included_schemas=public,graphql_public&detect_one_to_one_relationships=true" > "$out"
[[ -s "$out" ]] || { echo "✗ type generation returned nothing"; exit 1; }
mv "$out" "$ROOT/src/types/supabase.ts"
echo "✓ src/types/supabase.ts regenerated"
