#!/usr/bin/env bash
# gc3d.cloud deploys on the shared Droplet. Installed by gc3d-setup.sh as /usr/local/sbin/gc3d-deploy (root only).
# GitHub Actions reaches it through the restricted "gc3d-deploy" SSH user and gc3d-ssh-gate; you can run it as root.
#
#   gc3d-deploy deploy <git-sha> <image> <registry-user>   token for ghcr.io on stdin (CI passes its run token)
#   gc3d-deploy rollback <registry-user>                   token on stdin; back to the release before the current one
#   gc3d-deploy status
#   gc3d-deploy backup                                     database dump to /var/lib/gc3d/backups (nightly cron)
#
# A release is (git commit, image): the image is the app, the commit is infra/gc3d (compose file) at that commit.
# Deploy: lock → database dump → registry login in a throwaway config → pull → configs from the commit → replace
# gc3d-app → container health → https://gc3d.cloud/api/health through the live Nginx → keep, or roll back.
# Only the gc3d project is touched. The live site's containers are never stopped, recreated or reconfigured here.
set -euo pipefail
umask 077

SRC=/opt/gc3d                       # git checkout (public repo, fetched over HTTPS)
STATE=/var/lib/gc3d                 # env file, releases, backups, lock
ENV_FILE="$STATE/gc3d.env"
DOMAIN=gc3d.cloud
HEALTH_WAIT=${HEALTH_WAIT:-240}     # first start runs every migration; the image's health check starts at 30 s

log() { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "run as root"
[ -f "$ENV_FILE" ] || die "$ENV_FILE missing: run gc3d-setup.sh first"
mkdir -p "$STATE/releases" "$STATE/backups"

exec 9>"$STATE/.lock"
flock -n 9 || die "another gc3d deploy is running"

compose() { docker compose -p gc3d --env-file "$ENV_FILE" -f "$SRC/infra/gc3d/compose.yml" "$@"; }
env_set() {   # replace or append KEY=VALUE in the env file, keeping every other line
  local tmp; tmp="$(mktemp "$STATE/.env.XXXXXX")"
  awk -v k="$1" -v v="$2" -F= 'BEGIN{done=0} $1==k {print k"="v; done=1; next} {print} END{if(!done) print k"="v}' "$ENV_FILE" > "$tmp"
  chmod 600 "$tmp"; mv "$tmp" "$ENV_FILE"
}
current() { cat "$STATE/releases/current" 2>/dev/null || true; }

# Registry login without leaving credentials behind: a private DOCKER_CONFIG for this run, removed on exit.
DOCKER_CONFIG="$(mktemp -d /tmp/gc3d-docker.XXXXXX)"; export DOCKER_CONFIG
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
registry_login() {   # <user>, token on stdin
  local user="$1" token
  [[ "$user" =~ ^[A-Za-z0-9-]{1,39}(\[bot\])?$ ]] || die "bad registry user"
  IFS= read -r -t 10 token || true
  if [ -n "${token:-}" ]; then printf '%s' "$token" | docker login ghcr.io -u "$user" --password-stdin >/dev/null || die "ghcr.io login failed"; fi
}

backup() {
  [ -n "$(compose ps -q gc3d-db 2>/dev/null)" ] || { log "database not running yet: nothing to back up"; return 0; }
  set -a; . "$ENV_FILE"; set +a
  local f="$STATE/backups/gc3d-$(date -u +%Y%m%d-%H%M%S).sql.gz"
  compose exec -T gc3d-db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner | gzip -9 > "$f"
  [ "$(stat -c %s "$f")" -gt 512 ] || die "backup looks empty: $f"
  find "$STATE/backups" -name 'gc3d-*.sql.gz' -mtime +14 -delete
  log "database backup: $f"
}

healthy() {
  local id status=starting start=$SECONDS
  while [ $((SECONDS - start)) -lt "$HEALTH_WAIT" ]; do
    id="$(compose ps -q gc3d-app 2>/dev/null || true)"
    status="$( [ -n "$id" ] && docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo missing)"
    case "$status" in
      healthy) break ;;
      unhealthy|exited|dead|missing) if [ $((SECONDS - start)) -gt 45 ]; then log "gc3d-app is $status"; return 1; fi ;;
    esac
    sleep 3
  done
  [ "$status" = healthy ] || { log "gc3d-app not healthy after ${HEALTH_WAIT}s ($status)"; return 1; }
  local i
  for i in $(seq 1 10); do   # the visitor's path: live Nginx, TLS, gc3d-app, gc3d-db
    curl -fsS --max-time 10 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/health" 2>/dev/null | grep -q '"ok":true' && return 0
    sleep 3
  done
  log "https://$DOMAIN/api/health failed through Nginx"; return 1
}

switch_to() {   # <sha> <image>
  local sha="$1" image="$2"
  git -C "$SRC" fetch --quiet origin "+refs/heads/*:refs/remotes/origin/*"
  git -C "$SRC" cat-file -e "$sha^{commit}" 2>/dev/null || die "commit $sha not found after fetch"
  git -C "$SRC" checkout --quiet -f --detach "$sha"
  docker image inspect "$image" >/dev/null 2>&1 || docker pull --quiet "$image" >/dev/null || die "pull failed: $image"
  env_set APP_IMAGE "$image"
  compose config --quiet || die "infra/gc3d/compose.yml at $sha is invalid"
  compose up -d --no-build gc3d-db
  compose up -d --no-build --no-deps --force-recreate gc3d-app
}

valid_image() { [[ "$1" =~ ^ghcr\.io/bluebonnetplayguard-dot/vivid-engine-site(:[A-Za-z0-9._-]+)?(@sha256:[0-9a-f]{64})?$ ]]; }

case "${1:-}" in
  deploy)
    sha="${2:-}"; image="${3:-}"; user="${4:-}"
    [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die "usage: gc3d-deploy deploy <40-char sha> <image> <registry-user>"
    valid_image "$image" || die "image must be ghcr.io/bluebonnetplayguard-dot/vivid-engine-site[:tag][@digest]"
    registry_login "$user"
    before="$(current)"
    log "deploying $sha → https://$DOMAIN"
    backup
    switch_to "$sha" "$image"
    if healthy; then
      [ -n "$before" ] && [ "$before" != "$sha $image" ] && echo "$before" > "$STATE/releases/previous"
      echo "$sha $image" > "$STATE/releases/current"
      echo "$(date -u +%FT%TZ) deployed $sha $image" >> "$STATE/releases/history.log"
      # Dangling layers of earlier gc3d pulls only. Never "-a": that could delete the live site's rollback images.
      docker image prune -f --filter "label=org.opencontainers.image.title=vivid-engine-site" >/dev/null 2>&1 || true
      log "deployed $sha; https://$DOMAIN is healthy"; exit 0
    fi
    log "new release failed; last gc3d-app log lines:"; compose logs --no-color --tail=60 gc3d-app || true
    if [ -n "$before" ]; then
      log "rolling back to $before"
      # shellcheck disable=SC2086
      switch_to $before
      healthy || die "deploy failed AND rollback unhealthy: compose logs gc3d-app"
      echo "$(date -u +%FT%TZ) FAILED $sha $image → back to $before" >> "$STATE/releases/history.log"
      die "deploy of $sha failed; previous release restored and healthy"
    fi
    die "first deploy failed; nothing to roll back to (gc3d.cloud shows 502 until a good release; the live site is unaffected)"
    ;;
  rollback)
    registry_login "${2:-}"
    prev="$(cat "$STATE/releases/previous" 2>/dev/null || true)"; [ -n "$prev" ] || die "no previous release recorded"
    cur="$(current)"
    log "rolling back $cur → $prev"
    # shellcheck disable=SC2086
    switch_to $prev
    healthy || die "rolled back but not healthy: compose logs gc3d-app"
    echo "$prev" > "$STATE/releases/current"; [ -n "$cur" ] && echo "$cur" > "$STATE/releases/previous"
    echo "$(date -u +%FT%TZ) rollback to $prev" >> "$STATE/releases/history.log"
    log "rolled back to $prev"
    ;;
  status)
    echo "current:  $(current)"; echo "previous: $(cat "$STATE/releases/previous" 2>/dev/null || echo none)"
    compose ps --format 'table {{.Service}}\t{{.Status}}'
    tail -n 5 "$STATE/releases/history.log" 2>/dev/null || true
    ;;
  backup) backup ;;
  *) die "usage: gc3d-deploy deploy <sha> <image> <user> | rollback <user> | status | backup" ;;
esac
