#!/usr/bin/env bash
# Image-based deploy with automatic rollback. Runs ON the server (CI calls it over SSH; you can run it by hand).
#
#   remote-deploy.sh deploy   <git-sha> <image>   check out <git-sha> (configs), run <image>, verify, keep or roll back
#   remote-deploy.sh rollback                     go back to the release that ran before the current one
#   remote-deploy.sh status                       print the current and previous release
#
# A "release" is a (git commit, image) pair. The image holds the app; the commit holds this folder's configs (compose
# file, Nginx template, scripts). Both move together, so a rollback restores both.
#
# Steps of a deploy:
#   1. lock (one deploy at a time), record the running release as "previous"
#   2. database dump (scripts/backup.sh) if Postgres is running; migrations are additive, the dump is the safety net
#   3. git checkout of the commit (detached), pull the image, write APP_IMAGE into .env
#   4. replace the app container; restart Nginx only when its template changed
#   5. wait for the container health check, then check https://$DOMAIN through Nginx
#   6. pass: write releases/current. fail: put the previous release back and exit 1
#
# Requirements on the server: /opt/vivid is a git checkout with a read-only deploy key (docs/GC3D-DEPLOY.md),
# infra/.env exists, and the caller may run docker (root or the docker group). Registry login is done by the caller
# (CI pipes a short-lived token to `docker login`); this script never sees a credential.
set -euo pipefail

# The deploy checks out another commit, which can rewrite this very file while bash is still reading it.
# Run from a private copy instead.
if [ -z "${REMOTE_DEPLOY_COPY:-}" ]; then
  copy="$(mktemp /tmp/remote-deploy.XXXXXX.sh)"; cp "$0" "$copy"
  REMOTE_DEPLOY_COPY="$copy" exec bash "$copy" "$@"
fi
trap 'rm -f "$REMOTE_DEPLOY_COPY"' EXIT

ROOT=/opt/vivid
INFRA="$ROOT/infra"
STATE="$ROOT/releases"        # current / previous / history.log (outside the git tree)
LOCK="$STATE/.lock"
HEALTH_WAIT=${HEALTH_WAIT:-180}   # seconds for the container to report healthy (migrations run on start)

log()  { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die()  { log "ERROR: $*" >&2; exit 1; }

mkdir -p "$STATE"
cd "$INFRA"
[ -f .env ] || die "$INFRA/.env is missing (copy .env.example and fill it in first)."

exec 9>"$LOCK"
flock -n 9 || die "Another deploy is running (lock $LOCK)."

env_get() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- || true; }
env_set() {   # replace or append KEY=VALUE in .env without touching any other line
  local key="$1" val="$2" tmp
  tmp="$(mktemp "$INFRA/.env.XXXXXX")"
  if grep -qE "^$key=" .env; then awk -v k="$key" -v v="$val" -F= 'BEGIN{OFS="="} $1==k {print k"="v; next} {print}' .env > "$tmp"
  else cat .env > "$tmp"; printf '%s=%s\n' "$key" "$val" >> "$tmp"; fi
  chmod 600 "$tmp"; mv "$tmp" .env
}

DOMAIN="$(env_get DOMAIN)"
[ -n "$DOMAIN" ] || die "DOMAIN is not set in .env."

current_release() { [ -f "$STATE/current" ] && cat "$STATE/current" || echo ""; }

health_ok() {
  # 1) Docker's own health check (the image's HEALTHCHECK calls /api/health, which queries the database)
  local id status=starting start=$SECONDS deadline=$((SECONDS + HEALTH_WAIT))
  while [ $SECONDS -lt $deadline ]; do
    id="$(docker compose ps -q app 2>/dev/null || true)"
    status="$( [ -n "$id" ] && docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo missing)"
    case "$status" in
      healthy) break ;;
      # "unhealthy" right after start can be the previous container's state; give it 20 s before believing it.
      unhealthy|exited|dead|missing) if [ $((SECONDS - start)) -gt 20 ]; then log "app container is $status"; return 1; fi ;;
    esac
    sleep 3
  done
  [ "$status" = healthy ] || { log "app did not become healthy within ${HEALTH_WAIT}s (last: $status)"; return 1; }
  # 2) The full path a visitor takes: Nginx, TLS, proxy, app, database
  local i
  for i in $(seq 1 10); do
    if curl -fsS --max-time 10 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/health" | grep -q '"ok":true'; then return 0; fi
    sleep 3
  done
  log "https://$DOMAIN/api/health failed through Nginx"; return 1
}

switch_to() {   # <sha> <image>: configs from <sha>, app from <image>
  local sha="$1" image="$2" old_tpl new_tpl
  old_tpl="$(sha256sum nginx/templates/default.conf.template | cut -d' ' -f1)"
  git -C "$ROOT" fetch --quiet origin "+refs/heads/*:refs/remotes/origin/*"
  git -C "$ROOT" cat-file -e "$sha^{commit}" 2>/dev/null || die "commit $sha is not on the server after fetch."
  # The working tree holds no local edits (server-only files are git-ignored); -f discards stray changes.
  git -C "$ROOT" checkout --quiet -f --detach "$sha"
  new_tpl="$(sha256sum nginx/templates/default.conf.template | cut -d' ' -f1)"
  env_set APP_IMAGE "$image"
  docker compose config --quiet || die "docker-compose.yml at $sha is invalid."
  docker image inspect "$image" >/dev/null 2>&1 || docker compose pull --quiet app
  docker compose up -d --no-build postgres   # no-op when running; needed before the app on a fresh server
  # --no-deps: Postgres and certbot keep running. --no-build: the server never compiles.
  docker compose up -d --no-deps --no-build --force-recreate app
  if [ "$old_tpl" != "$new_tpl" ] || [ -z "$(docker compose ps -q web)" ]; then
    log "Nginx config changed: recreating web"
    docker compose up -d --no-deps --force-recreate web
  fi
  # First deploy on a fresh server: start whatever isn't running yet (postgres, certbot, web).
  docker compose up -d --no-build
}

cmd="${1:-}"
case "$cmd" in
  status)
    echo "current:  $(current_release)"; echo "previous: $(cat "$STATE/previous" 2>/dev/null || echo none)"
    docker compose ps
    ;;

  deploy)
    sha="${2:-}"; image="${3:-}"
    [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die "usage: $0 deploy <40-char git sha> <image>"
    [[ "$image" =~ ^[a-z0-9./_-]+(:[A-Za-z0-9._-]+)?(@sha256:[0-9a-f]{64})?$ ]] || die "bad image reference: $image"
    before="$(current_release)"
    if [ "$before" = "$sha $image" ]; then log "Already running $sha"; health_ok && exit 0; fi
    log "Deploying $sha ($image) to $DOMAIN"
    if [ -n "$(docker compose ps -q postgres 2>/dev/null)" ]; then
      log "Database backup"; bash scripts/backup.sh
    else
      log "Postgres not running yet (first deploy): no backup to take"
    fi
    switch_to "$sha" "$image"
    if health_ok; then
      [ -n "$before" ] && echo "$before" > "$STATE/previous"
      echo "$sha $image" > "$STATE/current"
      echo "$(date -u +%FT%TZ) deployed $sha $image" >> "$STATE/history.log"
      docker image prune -f --filter "until=168h" >/dev/null || true
      log "Deployed $sha. https://$DOMAIN is healthy."
      exit 0
    fi
    log "Deploy failed health checks. Last app log lines:"
    docker compose logs --no-color --tail=60 app || true
    if [ -n "$before" ]; then
      log "Rolling back to $before"
      # shellcheck disable=SC2086
      switch_to $before
      if health_ok; then
        echo "$(date -u +%FT%TZ) FAILED $sha $image -> rolled back to $before" >> "$STATE/history.log"
        die "Deploy of $sha failed; rolled back to the previous release (healthy)."
      fi
      die "Deploy of $sha failed AND the rollback is unhealthy. Check: docker compose logs app"
    fi
    die "First deploy failed; there is no previous release to roll back to."
    ;;

  rollback)
    prev="$(cat "$STATE/previous" 2>/dev/null || true)"
    [ -n "$prev" ] || die "No previous release recorded."
    cur="$(current_release)"
    log "Rolling back: $cur -> $prev"
    # shellcheck disable=SC2086
    switch_to $prev
    health_ok || die "Rolled back to $prev but it is not healthy. Check: docker compose logs app"
    echo "$prev" > "$STATE/current"; [ -n "$cur" ] && echo "$cur" > "$STATE/previous"
    echo "$(date -u +%FT%TZ) rollback to $prev" >> "$STATE/history.log"
    log "Rolled back to $prev"
    ;;

  *) die "usage: $0 deploy <sha> <image> | rollback | status" ;;
esac
