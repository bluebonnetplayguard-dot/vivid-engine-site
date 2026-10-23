#!/usr/bin/env bash
# Restores a backup made by backup.sh. This REPLACES the current database.
#   bash scripts/restore.sh /opt/vivid/backups/vivid-YYYYMMDD-HHMMSS.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
FILE="${1:?Pass the backup file to restore}"
[ -f "$FILE" ] || { echo "No such file: $FILE"; exit 1; }

read -r -p "Replace the live database with $FILE? Type RESTORE to continue: " answer
[ "$answer" = "RESTORE" ] || { echo "Cancelled."; exit 1; }

docker compose stop app
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS $POSTGRES_DB WITH (FORCE);" -c "CREATE DATABASE $POSTGRES_DB;"
gunzip -c "$FILE" | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 >/dev/null
docker compose start app
echo "Restored $FILE"
