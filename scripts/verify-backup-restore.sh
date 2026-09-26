#!/usr/bin/env bash
# CI-only recovery rehearsal on the disposable database service.
set -euo pipefail
: "${POSTGRES_CONTAINER:?Pass the CI PostgreSQL service container ID}"
db_user=footyiq_test
source_db=footyiq_deploy
restore_db=footyiq_restore_test
backup=/tmp/footyiq-recovery.dump

# Use the real API to create a valid record with context and collection ownership.
cookie_file=$(mktemp)
trap 'rm -f "$cookie_file"' EXIT
curl --fail --silent --cookie-jar "$cookie_file" http://localhost:10000/api/v1/session >/dev/null
curl --fail --silent --cookie "$cookie_file" -H 'Content-Type: application/json' \
  -d '{"id":"927f8515-e678-4941-87a8-9b6efec232fb","x":108,"y":40,"context":{"body_part":"Head","technique":"Normal","shot_type":"Open Play","play_pattern":"Regular Play"}}' \
  http://localhost:10000/api/v1/shots >/dev/null

# Exercise the same URI-through-environment expansion as backup-neon.ps1.
docker exec -e "PGDATABASE=postgresql://footyiq_test:footyiq_test@127.0.0.1:5432/$source_db" "$POSTGRES_CONTAINER" sh -c 'exec pg_dump --dbname="$PGDATABASE" --format=custom --no-owner --no-acl --file=/tmp/footyiq-recovery.dump'
# createdb fails if the target already exists; never overwrite a database.
docker exec "$POSTGRES_CONTAINER" createdb -U "$db_user" "$restore_db"
docker exec "$POSTGRES_CONTAINER" pg_restore -U "$db_user" -d "$restore_db" --exit-on-error --single-transaction --no-owner --no-acl "$backup"

fingerprint="SELECT json_build_object('shots',(SELECT json_agg(s ORDER BY storage_id) FROM shots s),'migrations',(SELECT json_agg(version ORDER BY version) FROM schema_migrations),'indexes',(SELECT json_agg(indexdef ORDER BY indexname) FROM pg_indexes WHERE schemaname='public'));"
source_state=$(docker exec "$POSTGRES_CONTAINER" psql -U "$db_user" -d "$source_db" -At -v ON_ERROR_STOP=1 -c "$fingerprint")
restored_state=$(docker exec "$POSTGRES_CONTAINER" psql -U "$db_user" -d "$restore_db" -At -v ON_ERROR_STOP=1 -c "$fingerprint")
if [[ "$source_state" != "$restored_state" ]]; then
  echo 'FAIL: restored rows, migration versions, or indexes differ.' >&2
  exit 1
fi
test "$(docker exec "$POSTGRES_CONTAINER" psql -U "$db_user" -d "$restore_db" -At -c 'SELECT count(*) FROM shots')" -gt 0
# Verify the restored identity sequence can generate a non-colliding next ID.
docker exec "$POSTGRES_CONTAINER" psql -U "$db_user" -d "$restore_db" -v ON_ERROR_STOP=1 -c "INSERT INTO shots (id,x,y,distance_yards,angle_degrees,xg_probability,interpretation,collection_id,model_id,context) SELECT '731f2f2b-d4b0-40fd-ad21-f91bfa2a4a8d',x,y,distance_yards,angle_degrees,xg_probability,interpretation,collection_id,model_id,context FROM shots LIMIT 1;" >/dev/null
echo 'PASS: custom-format dump restored into a separate database; rows, context, collection ownership, migrations, indexes and identity sequence verified.'
# All databases and the dump remain inside the disposable CI service container.
