#!/usr/bin/env bash
set -euo pipefail

container_name="life-os-batch-rpc-$$"

cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

docker run --detach --rm \
  --name "$container_name" \
  --env POSTGRES_PASSWORD=postgres \
  --mount "type=bind,source=$PWD/supabase,target=/workspace/supabase,readonly" \
  postgres:15-alpine >/dev/null

attempt=0
until docker exec "$container_name" pg_isready --username postgres >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "PostgreSQL did not become ready" >&2
    exit 1
  fi
  sleep 1
done

docker exec "$container_name" psql --username postgres --dbname postgres \
  --set ON_ERROR_STOP=on \
  --command "create schema auth; create table auth.users (id uuid primary key); create role service_role nologin; create role anon nologin; create role authenticated nologin; create function auth.uid() returns uuid language sql stable as 'select null::uuid';"

docker exec "$container_name" psql --username postgres --dbname postgres \
  --set ON_ERROR_STOP=on \
  --file /workspace/supabase/schema.sql

docker exec "$container_name" psql --username postgres --dbname postgres \
  --set ON_ERROR_STOP=on \
  --file /workspace/supabase/tests/batch_intake.sql
