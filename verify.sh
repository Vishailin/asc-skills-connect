#!/bin/bash
# Re-verification script for ASC Skills Connect — rebuilds the database
# from scratch and applies every migration + seed file in order. Mirrors
# the curl-tested claims in the brief and the per-module READMEs.
#
# Usage: bash verify.sh
# Requires PostgreSQL's bin/ on PATH, or edit PSQL_BIN below.
set -e

DB="${DB_NAME:-learner_registration_database}"
DB_USER="${DB_USER:-postgres}"
PSQL_BIN="${PSQL_BIN:-/c/Program Files/PostgreSQL/18/bin}"
PSQL="$PSQL_BIN/psql.exe"

export PGPASSWORD="${DB_PASSWORD:-postgres}"

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
DB_DIR="$REPO_ROOT/learner_registration_database"

echo "== dropping/creating $DB =="
"$PSQL_BIN/dropdb.exe" -U "$DB_USER" --if-exists "$DB"
"$PSQL_BIN/createdb.exe" -U "$DB_USER" "$DB"

for f in "$DB_DIR"/migrations/*.sql; do
  echo "== applying migrations/$(basename "$f") =="
  "$PSQL" -U "$DB_USER" -d "$DB" -v ON_ERROR_STOP=1 -f "$f"
done

for f in "$DB_DIR"/seeds/*.sql; do
  echo "== applying seeds/$(basename "$f") =="
  "$PSQL" -U "$DB_USER" -d "$DB" -v ON_ERROR_STOP=1 -f "$f"
done

echo "== sanity query: learner_search_view =="
"$PSQL" -U "$DB_USER" -d "$DB" -c "SELECT full_name, province, highest_qualification, availability_status FROM learner_search_view ORDER BY full_name;"

echo "== sanity query: tsp_candidate_view =="
"$PSQL" -U "$DB_USER" -d "$DB" -c "SELECT full_name, prior_funded_programme_count FROM tsp_candidate_view ORDER BY full_name;"

echo "== ALL SQL APPLIED CLEANLY =="
