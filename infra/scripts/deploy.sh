#!/usr/bin/env bash
# Deploys a new version. Copy the updated project folder to /opt/vivid first
# (see docs/DEPLOY.md), then run from /opt/vivid/infra:
#   bash scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Backing up the database before migrating"
bash scripts/backup.sh

echo "==> Building and restarting the app (migrations run on start)"
docker compose build app
docker compose up -d app

for i in $(seq 1 45); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "App healthy."
    # Nginx reads its settings (nginx/templates) only at start: restart it so config changes apply.
    echo "==> Restarting Nginx to load any updated settings"
    docker compose up -d --force-recreate web
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 2
done
echo "App did not become healthy. Logs: docker compose logs --tail=100 app" >&2
exit 1
