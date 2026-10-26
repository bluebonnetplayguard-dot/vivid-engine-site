#!/usr/bin/env bash
# Error monitoring without a third-party service. Cron runs this every 5 minutes (installed by gc3d bootstrap):
#   */5 * * * * /opt/vivid/infra/scripts/error-watch.sh >> /var/log/vivid-error-watch.log 2>&1
#
# Each run looks only at what is new since the previous run:
#   - app errors: NestJS "ERROR" lines and uncaught exceptions in the app container's log
#   - 5xx responses in the Nginx access log (502/504 = app down or too slow)
#   - the app container's health status, disk use and memory
# Problems go to ALERT_WEBHOOK_URL from infra/.env (Slack or Discord incoming webhook, the same one the Billing
# Monitor uses). Repeated identical alerts are sent at most once an hour. Without a webhook it only writes the log.
set -euo pipefail
cd "$(dirname "$0")/.."
STATE=/var/lib/vivid-error-watch
mkdir -p "$STATE"
env_get() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- || true; }
DOMAIN="$(env_get DOMAIN)"; HOOK="$(env_get ALERT_WEBHOOK_URL)"
ERR_THRESHOLD="${ERR_THRESHOLD:-5}"     # app error lines per 5 minutes before alerting
X5_THRESHOLD="${X5_THRESHOLD:-10}"      # 5xx responses per 5 minutes before alerting
host="$(hostname)"; now="$(date -u +%FT%TZ)"
problems=()

# 1) App log since the last run
since="$(cat "$STATE/app.since" 2>/dev/null || date -u -d '-5 min' +%FT%TZ)"
applog="$(docker compose logs --no-color --since "$since" app 2>/dev/null || true)"
echo "$now" > "$STATE/app.since"
errors="$(grep -E ' ERROR | Error: |Unhandled|uncaught|FATAL' <<<"$applog" | grep -v 'ThrottlerException' || true)"
n_err="$(grep -c . <<<"$errors" || true)"
if [ "${n_err:-0}" -ge "$ERR_THRESHOLD" ]; then
  sample="$(head -n 3 <<<"$errors" | cut -c1-220 | paste -sd'|' -)"
  problems+=("$n_err app errors since $since. First lines: $sample")
fi

# 2) Nginx 5xx since the last run (byte offset into the access log; resets when the log rotates)
LOG=logs/nginx/vivid-access.log
if [ -f "$LOG" ]; then
  size="$(stat -c %s "$LOG")"; off="$(cat "$STATE/nginx.offset" 2>/dev/null || echo 0)"
  [ "$off" -le "$size" ] || off=0
  n5xx="$(tail -c +"$((off + 1))" "$LOG" | awk '$9 ~ /^5[0-9][0-9]$/' | wc -l)"
  echo "$size" > "$STATE/nginx.offset"
  [ "$n5xx" -ge "$X5_THRESHOLD" ] && problems+=("$n5xx server errors (5xx) in the last 5 minutes at https://$DOMAIN")
fi

# 3) Container health, disk, memory
id="$(docker compose ps -q app 2>/dev/null || true)"
health="$( [ -n "$id" ] && docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" || echo missing)"
[ "$health" = healthy ] || problems+=("app container is $health")
disk="$(df --output=pcent / | tail -n1 | tr -dc 0-9)"
[ "$disk" -lt 85 ] || problems+=("disk is ${disk}% full (docker image prune -af and old backups free space)")
mem="$(free | awk '/^Mem:/ {printf "%d", ($2-$7)*100/$2}')"
[ "$mem" -lt 92 ] || problems+=("memory is ${mem}% used")

[ "${#problems[@]}" -eq 0 ] && { echo "$now ok"; exit 0; }

msg="[$host / $DOMAIN] $(printf '%s; ' "${problems[@]}")"
echo "$now ALERT $msg"
# One alert per distinct problem set per hour.
key="$(printf '%s' "${problems[@]}" | sed 's/[0-9]//g' | sha1sum | cut -c1-12)"
last="$(cat "$STATE/sent.$key" 2>/dev/null || echo 0)"
[ $(( $(date +%s) - last )) -ge 3600 ] || exit 0
date +%s > "$STATE/sent.$key"
if [ -n "$HOOK" ]; then
  # Slack reads "text", Discord reads "content"; send both.
  payload="$(jq -nc --arg t "$msg" '{text: $t, content: $t}')"
  curl -fsS --max-time 10 -H 'Content-Type: application/json' -d "$payload" "$HOOK" >/dev/null || echo "$now webhook delivery failed"
fi
