#!/usr/bin/env bash
# gc3d.cloud error monitoring without a third-party service. Installed as /usr/local/sbin/gc3d-error-watch; cron runs
# it every 5 minutes (gc3d-setup.sh). Each run looks only at what is new since the previous run:
#   - app errors: NestJS "ERROR" lines and uncaught exceptions in gc3d-app's log
#   - 5xx responses for gc3d.cloud (its own Nginx access log, separate from the live site's)
#   - gc3d-app health, and the shared server's disk and memory (gc3d shares them with vividenginesolutions.com)
# Alerts go to ALERT_WEBHOOK_URL in /var/lib/gc3d/gc3d.env (Slack or Discord incoming webhook), at most once an hour
# per kind of problem. Without a webhook it only writes /var/log/gc3d-error-watch.log.
set -euo pipefail
STATE=/var/lib/gc3d
ENV_FILE="$STATE/gc3d.env"
COMPOSE=(docker compose -p gc3d --env-file "$ENV_FILE" -f /opt/gc3d/infra/gc3d/compose.yml)
NGINX_LOG=/opt/vivid/infra/logs/nginx/gc3d-access.log
W="$STATE/error-watch"; mkdir -p "$W"
env_get() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true; }
HOOK="$(env_get ALERT_WEBHOOK_URL)"
ERR_THRESHOLD="${ERR_THRESHOLD:-5}"     # app error lines per 5 minutes
X5_THRESHOLD="${X5_THRESHOLD:-10}"      # 5xx responses per 5 minutes
now="$(date -u +%FT%TZ)"
problems=()

# Nothing deployed yet: nothing to watch.
[ -n "$(env_get APP_IMAGE)" ] || { echo "$now not deployed yet"; exit 0; }

since="$(cat "$W/app.since" 2>/dev/null || date -u -d '-5 min' +%FT%TZ)"
applog="$("${COMPOSE[@]}" logs --no-color --since "$since" gc3d-app 2>/dev/null || true)"
echo "$now" > "$W/app.since"
errors="$(grep -E ' ERROR | Error: |Unhandled|uncaught|FATAL' <<<"$applog" | grep -v 'ThrottlerException' || true)"
n_err="$(grep -c . <<<"$errors" || true)"
if [ "${n_err:-0}" -ge "$ERR_THRESHOLD" ]; then
  problems+=("$n_err app errors since $since; first: $(head -n 3 <<<"$errors" | cut -c1-200 | paste -sd'|' -)")
fi

if [ -f "$NGINX_LOG" ]; then   # byte offset since the last run; starts over when the log rotates
  size="$(stat -c %s "$NGINX_LOG")"; off="$(cat "$W/nginx.offset" 2>/dev/null || echo 0)"
  [ "$off" -le "$size" ] || off=0
  n5xx="$(tail -c +"$((off + 1))" "$NGINX_LOG" | awk '$9 ~ /^5[0-9][0-9]$/' | wc -l)"
  echo "$size" > "$W/nginx.offset"
  if [ "$n5xx" -ge "$X5_THRESHOLD" ]; then problems+=("$n5xx server errors (5xx) on gc3d.cloud in 5 minutes"); fi
fi

id="$("${COMPOSE[@]}" ps -q gc3d-app 2>/dev/null || true)"
health="$( [ -n "$id" ] && docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" || echo missing)"
if [ "$health" != healthy ]; then problems+=("gc3d-app is $health"); fi
disk="$(df --output=pcent / | tail -n1 | tr -dc 0-9)"
if [ "$disk" -ge 85 ]; then problems+=("server disk ${disk}% full (shared with vividenginesolutions.com)"); fi
mem="$(free | awk '/^Mem:/ {printf "%d", ($2-$7)*100/$2}')"
if [ "$mem" -ge 92 ]; then problems+=("server memory ${mem}% used"); fi

[ "${#problems[@]}" -eq 0 ] && { echo "$now ok"; exit 0; }
msg="[gc3d.cloud on $(hostname)] $(printf '%s; ' "${problems[@]}")"
echo "$now ALERT $msg"
key="$(printf '%s' "${problems[@]}" | sed 's/[0-9]//g' | sha1sum | cut -c1-12)"
last="$(cat "$W/sent.$key" 2>/dev/null || echo 0)"
[ $(( $(date +%s) - last )) -ge 3600 ] || exit 0
date +%s > "$W/sent.$key"
if [ -n "$HOOK" ]; then
  payload="$(jq -nc --arg t "$msg" '{text: $t, content: $t}' 2>/dev/null || printf '{"text":"%s","content":"%s"}' "${msg//\"/\'}" "${msg//\"/\'}")"
  curl -fsS --max-time 10 -H 'Content-Type: application/json' -d "$payload" "$HOOK" >/dev/null || echo "$now webhook delivery failed"
fi
