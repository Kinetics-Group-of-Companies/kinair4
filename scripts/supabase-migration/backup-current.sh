#!/usr/bin/env bash
set -euo pipefail

: "${SOURCE_DB_URL:?Set SOURCE_DB_URL to the current Supabase Postgres connection string}"

OUT_DIR="${1:-supabase-backup/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT_DIR"

echo "Creating Supabase database backup in $OUT_DIR"
supabase db dump --db-url "$SOURCE_DB_URL" -f "$OUT_DIR/roles.sql" --role-only
supabase db dump --db-url "$SOURCE_DB_URL" -f "$OUT_DIR/schema.sql"
supabase db dump --db-url "$SOURCE_DB_URL" -f "$OUT_DIR/data.sql" --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes"

# Preserve the production migration ledger as well. This is important because
# KINAIR has historical migration-version drift from earlier project moves.
supabase db dump --db-url "$SOURCE_DB_URL" -f "$OUT_DIR/history_schema.sql" --schema supabase_migrations
supabase db dump --db-url "$SOURCE_DB_URL" -f "$OUT_DIR/history_data.sql" --use-copy --data-only --schema supabase_migrations

cat > "$OUT_DIR/README.txt" <<'EOF'
KINAIR Supabase backup.

Do not commit this directory. It can contain production data and auth-related records.

Restore with scripts/supabase-migration/restore-target.sh after creating the
company-controlled target project. Copy Storage objects separately with
copy-storage.mjs, then deploy Edge Functions and configure secrets.
EOF

echo "Backup complete: $OUT_DIR"
