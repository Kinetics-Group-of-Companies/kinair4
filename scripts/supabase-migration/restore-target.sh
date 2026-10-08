#!/usr/bin/env bash
set -euo pipefail

: "${TARGET_DB_URL:?Set TARGET_DB_URL to the NEW company Supabase Postgres connection string}"

BACKUP_DIR="${1:?Usage: restore-target.sh <backup-directory>}"
for file in roles.sql schema.sql data.sql; do
  test -f "$BACKUP_DIR/$file" || { echo "Missing $BACKUP_DIR/$file"; exit 1; }
done

echo "Restoring KINAIR database to target project..."
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file "$BACKUP_DIR/roles.sql" \
  --file "$BACKUP_DIR/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$BACKUP_DIR/data.sql" \
  --dbname "$TARGET_DB_URL"

# Preserve the source migration ledger when the dump is available.
if [[ -f "$BACKUP_DIR/history_schema.sql" && -f "$BACKUP_DIR/history_data.sql" ]]; then
  echo "Restoring Supabase migration history..."
  # This follows Supabase's backup/restore guidance. On a target where
  # supabase_migrations already exists, schema statements may report existing
  # objects. If that happens, restore history_data.sql after reconciling the
  # existing migration table rather than replaying application migrations.
  if ! psql --variable ON_ERROR_STOP=1 --file "$BACKUP_DIR/history_schema.sql" --dbname "$TARGET_DB_URL"; then
    echo "Migration-history schema already exists; continuing with history data."
  fi
  psql --variable ON_ERROR_STOP=1 --file "$BACKUP_DIR/history_data.sql" --dbname "$TARGET_DB_URL"
fi

echo "Database restore complete."
echo "Next: copy Storage objects, configure target secrets, deploy functions, recreate cron jobs, then run verify-target.sql."
