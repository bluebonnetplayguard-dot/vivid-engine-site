#!/usr/bin/env bash
# Release checks from the Final Execute-and-Deploy Command, section 4. Run from the repository root on a machine
# with Node 22, Docker and network access:   bash scripts/verify-release.sh 2>&1 | tee verify-release.log
# Uses only throwaway containers and a throwaway database. Never touches production or /opt/vivid/infra/.env.
set -euo pipefail
cd "$(dirname "$0")/.."
step() { printf '\n==> %s\n' "$*"; }
cleanup() { docker rm -f vivid-smoke vivid-smoke-db >/dev/null 2>&1 || true; docker network rm vivid-smoke-net >/dev/null 2>&1 || true; }
trap cleanup EXIT
# On failure say which command stopped (shown as an annotation in GitHub Actions). Variables are not expanded, so no secrets.
trap 'rc=$?; echo "::error::verify-release stopped at line $LINENO: $BASH_COMMAND (exit $rc)"; { docker logs --tail 25 vivid-smoke 2>&1 || true; } | cut -c1-200 | while read -r l; do echo "::error::app log: $l"; done' ERR

step "site: install, lint, build (with prerender)";  npm --prefix site ci --no-audit --no-fund && npm --prefix site run lint && npm --prefix site run build
step "site: retired names";                          npm --prefix site run check:names
step "site: prerendered pages";                      test -f site/dist/index.prerendered.html && grep -i "<h1" site/dist/areas/katy/index.html | head -c 200; echo

step "backend: install, build"
npm --prefix backend ci --no-audit --no-fund && npm --prefix backend run build

step "backend: tests (throwaway Postgres 16 container)"
cleanup
docker network create vivid-smoke-net >/dev/null
DB_PASS="$(openssl rand -hex 16)"
docker run -d --rm --name vivid-smoke-db --network vivid-smoke-net -p 127.0.0.1:55432:5432 \
  -e POSTGRES_PASSWORD="$DB_PASS" -e POSTGRES_DB=vivid_test postgres:16-bookworm >/dev/null
for _ in $(seq 1 30); do docker exec vivid-smoke-db pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 2
TEST_DATABASE_URL="postgres://postgres:${DB_PASS}@127.0.0.1:55432/vivid_test" npm --prefix backend test

step "docker: build image"
docker build -t vivid-app:release-test .

step "docker: smoke test"
# The app refuses to start without a database and its secrets, so it gets a fresh database and random one-off values.
docker exec vivid-smoke-db psql -U postgres -qc 'CREATE DATABASE vivid_smoke' >/dev/null
docker run --rm -d -p 8080:8080 --name vivid-smoke --network vivid-smoke-net -e NODE_ENV=production \
  -e DATABASE_URL="postgres://postgres:${DB_PASS}@vivid-smoke-db:5432/vivid_smoke" \
  -e JWT_ACCESS_SECRET="$(openssl rand -hex 32)" -e JWT_REFRESH_SECRET="$(openssl rand -hex 32)" \
  -e PUBLIC_CLIENT_SECRET="$(openssl rand -hex 32)" -e BILLING_MONITOR_JOBS=off vivid-app:release-test >/dev/null
for _ in $(seq 1 40); do curl -fsS http://localhost:8080/api/health >/dev/null 2>&1 && break; sleep 2; done
curl -fsS http://localhost:8080/api/health; echo
curl -fsS http://localhost:8080/areas/katy | grep -io "<h1[^>]*>[^<]*" | head -1
curl -fsS http://localhost:8080/sitemap.xml | head -5
test "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/ai-search)" = 301 && echo "/ai-search -> 301"
test "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/no-such-page)" = 404 && echo "unknown page -> 404"
docker stop vivid-smoke >/dev/null

step "old phone number and Stripe are gone"
# The old number is assembled from pieces so this script doesn't trip the repo's own retired-names check.
OLD_A="337""287""7543"; OLD_B="337) 287""-7543"
if grep -rn -e "$OLD_A" -e "$OLD_B" -e stripe site backend --include=*.{js,jsx,ts,tsx,mjs,html,json} -i \
     --exclude-dir=node_modules --exclude-dir=dist --exclude=package-lock.json; then
  echo "FAIL: found the strings above"; exit 1
fi
echo "none found"

step "all checks passed"
