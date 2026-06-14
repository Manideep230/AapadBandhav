#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <path_to_backup_file.sql.gz>" >&2
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file not found: ${BACKUP_FILE}" >&2
    exit 1
fi

# Load environment variables
if [ -f .env.production ]; then
    export $(grep -v '^#' .env.production | xargs)
fi

DB_CONTAINER="aapadbandhav_db"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-aapadbandhav_db}"

echo "========================================================="
echo "WARNING: This will overwrite the database '${DB_NAME}'."
echo "========================================================="
read -p "Are you absolutely sure you want to proceed? (y/N): " response
if [[ ! "$response" =~ ^[yY]$ ]]; then
    echo "Restore operation aborted by user."
    exit 0
fi

echo "Terminating existing connections to database '${DB_NAME}'..."
docker exec -t "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -c \
    "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = '${DB_NAME}' AND pid <> pg_backend_pid();" || true

echo "Dropping and re-creating database '${DB_NAME}'..."
docker exec -t "$DB_CONTAINER" dropdb -U "$DB_USER" --if-exists "$DB_NAME"
docker exec -t "$DB_CONTAINER" createdb -U "$DB_USER" "$DB_NAME"

echo "Restoring database structure and data from ${BACKUP_FILE}..."
if gunzip -c "$BACKUP_FILE" | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"; then
    echo "=== Database restore completed successfully! ==="
else
    echo "Error: Database restore failed!" >&2
    exit 1
fi
