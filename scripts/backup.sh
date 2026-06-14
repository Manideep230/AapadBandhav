#!/usr/bin/env bash
set -euo pipefail

# Directory on the host to store backups
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/aapadbandhav_backup_${TIMESTAMP}.sql.gz"

# Load environment variables
if [ -f .env.production ]; then
    # Export vars, ignoring comments and empty lines
    export $(grep -v '^#' .env.production | xargs)
fi

DB_CONTAINER="aapadbandhav_db"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-aapadbandhav_db}"

echo "=== Starting database backup ==="
if ! docker exec -t "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"; then
    echo "Error: Database backup failed!" >&2
    exit 1
fi

echo "Backup completed successfully: ${BACKUP_FILE}"

# Retention Policy: Clean up backups older than 7 days
echo "Applying retention policy (keeping last 7 days of backups)..."
find "$BACKUP_DIR" -name "aapadbandhav_backup_*.sql.gz" -mtime +7 -exec rm -f {} \;
echo "Cleanup complete."
