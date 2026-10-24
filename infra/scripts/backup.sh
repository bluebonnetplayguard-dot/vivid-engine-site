#!/usr/bin/env bash
# Nightly PostgreSQL backup: compressed dump kept on the Droplet for 14 days
# and copied off-site to DigitalOcean Spaces. Installed by setup-droplet.sh as
# a cron job (03:15 server time). Restore steps: docs/DEPLOY.md.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

STAMP=$(date -u +%Y%m%d-%H%M%S)
DIR=/opt/vivid/backups
FILE="$DIR/vivid-$STAMP.sql.gz"
mkdir -p "$DIR"

docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=plain --no-owner | gzip -9 > "$FILE"
# A dump smaller than 1 KB means something went wrong.
[ "$(stat -c %s "$FILE")" -gt 1024 ] || { echo "Backup looks empty: $FILE" >&2; exit 1; }

if [ -n "${SPACES_KEY:-}" ]; then
  docker run --rm -v "$DIR:/backups:ro" \
    -e AWS_ACCESS_KEY_ID="$SPACES_KEY" -e AWS_SECRET_ACCESS_KEY="$SPACES_SECRET" \
    amazon/aws-cli:2.22.0 s3 cp "/backups/$(basename "$FILE")" "s3://$SPACES_BUCKET/postgres/" \
    --endpoint-url "https://$SPACES_REGION.digitaloceanspaces.com" --only-show-errors
fi

find "$DIR" -name 'vivid-*.sql.gz' -mtime +14 -delete
echo "Backup complete: $FILE"
