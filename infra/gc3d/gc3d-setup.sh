#!/usr/bin/env bash
# Adds gc3d.cloud to the shared Droplet that already runs vividenginesolutions.com (/opt/vivid/infra, project "vivid").
# Run as root in the DigitalOcean Droplet console:
#
#   curl -fsSL https://raw.githubusercontent.com/bluebonnetplayguard-dot/vivid-engine-site/staging/gc3d/infra/gc3d/gc3d-setup.sh -o /root/gc3d-setup.sh
#   bash /root/gc3d-setup.sh install you@example.com
#
#   bash /root/gc3d-setup.sh install <email>   first install, or re-run to update scripts/Nginx block (safe to repeat)
#   bash /root/gc3d-setup.sh ci-key            new GitHub Actions key (prints it once, then deletes it from the server)
#   bash /root/gc3d-setup.sh uninstall         removes gc3d from Nginx and stops it; keeps its database volume and backups
#
# What install changes, in order. Every step checks first and stops on any doubt; nothing of the live site's code,
# database, settings (.env) or containers other than "web" is touched:
#   1. preflight: live site healthy, DNS for gc3d.cloud and www point here, enough memory and disk
#   2. /opt/gc3d: read-only clone of the public repository (branch staging/gc3d)
#   3. /var/lib/gc3d/gc3d.env: gc3d's own settings with fresh secrets (mode 600; its own database, own JWT keys)
#   4. HTTPS certificate for gc3d.cloud + www, issued by the live site's certbot over the existing port-80 challenge
#      path (no downtime). The certbot container already renews every certificate it holds.
#   5. Nginx: the gc3d server block, mounted through /opt/vivid/infra/docker-compose.override.yml.
#      The full new configuration is tested in a throwaway container first (nginx -t). Only then is "web" recreated
#      (1–2 s). If vividenginesolutions.com isn't healthy right after, the old configuration is put back automatically.
#   6. /usr/local/sbin/gc3d-deploy + gc3d-ssh-gate, user "gc3d-deploy" (forced command, one sudo rule), CI key
#   7. cron: nightly gc3d database dump (03:40), error watch every 5 minutes; log rotation
set -euo pipefail
umask 022

REPO_URL=https://github.com/bluebonnetplayguard-dot/vivid-engine-site.git
BRANCH="${GC3D_BRANCH:-staging/gc3d}"
DOMAIN=gc3d.cloud
VIVID=/opt/vivid/infra
SRC=/opt/gc3d
STATE=/var/lib/gc3d
NGINX_IMAGE=nginx:1.27-alpine
say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31mSTOPPED: %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "run as root"

vivid() { (cd "$VIVID" && docker compose "$@"); }
vivid_domain() { grep -E '^DOMAIN=' "$VIVID/.env" | tail -n1 | cut -d= -f2-; }
live_ok() {   # the live site through its own Nginx
  local d; d="$(vivid_domain)"
  curl -fsS --max-time 10 --resolve "$d:443:127.0.0.1" "https://$d/api/health" 2>/dev/null | grep -q '"ok":true'
}

print_ci_secrets() {
  local ip4; ip4="$(curl -fsS --max-time 5 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address)"
  cat <<EOF

================================================================================================
 GitHub > repository Settings > Environments > gc3d-staging  (create it if missing)

 Variable  GC3D_HOST        = $ip4
 Variable  GC3D_IPV4        = $ip4
 Variable  GC3D_SSH_USER    = gc3d-deploy

 Secret    GC3D_KNOWN_HOSTS   (both lines)
$(for t in ed25519 ecdsa; do [ -f /etc/ssh/ssh_host_${t}_key.pub ] && echo "$ip4 $(cut -d' ' -f1,2 /etc/ssh/ssh_host_${t}_key.pub)"; done)

 Secret    GC3D_SSH_KEY   (every line from -----BEGIN to -----END, inclusive)
$(cat /root/gc3d-ci-key)
================================================================================================
EOF
  read -r -p "Press Enter once GC3D_SSH_KEY is saved in GitHub (the private key is then deleted from this server)... " _
  shred -u /root/gc3d-ci-key
  echo "Deleted. This key can only run: deploy, rollback, status for gc3d.cloud."
}

new_ci_key() {
  rm -f /root/gc3d-ci-key /root/gc3d-ci-key.pub
  ssh-keygen -q -t ed25519 -N '' -C "github-actions@gc3d.cloud $(date +%F)" -f /root/gc3d-ci-key
  install -d -m 700 -o gc3d-deploy -g gc3d-deploy /home/gc3d-deploy/.ssh
  printf 'restrict,command="/usr/local/sbin/gc3d-ssh-gate" %s\n' "$(cat /root/gc3d-ci-key.pub)" > /home/gc3d-deploy/.ssh/authorized_keys
  chown gc3d-deploy:gc3d-deploy /home/gc3d-deploy/.ssh/authorized_keys; chmod 600 /home/gc3d-deploy/.ssh/authorized_keys
  rm -f /root/gc3d-ci-key.pub
}

nginx_test() {   # full config as the live container would render it, in a throwaway container on the same network
  docker run --rm --network vivid_default \
    -e DOMAIN="$(vivid_domain)" \
    -v "$VIVID/nginx/templates:/etc/nginx/templates:ro" \
    -v "$VIVID/nginx/extra/gc3d.conf.template:/etc/nginx/templates/gc3d.conf.template:ro" \
    -v vivid_certs:/etc/letsencrypt:ro -v vivid_acme:/var/www/acme:ro \
    --tmpfs /var/log/nginx \
    "$NGINX_IMAGE" nginx -t
}

install_nginx() {
  install -d "$VIVID/nginx/extra"
  local tpl="$VIVID/nginx/extra/gc3d.conf.template" ovr="$VIVID/docker-compose.override.yml"
  local had_ovr=0; [ -f "$ovr" ] && had_ovr=1
  if [ "$had_ovr" = 1 ] && ! grep -q 'gc3d.conf.template' "$ovr"; then
    die "$ovr already exists with other content. Merge the gc3d volume line by hand (see docs/GC3D-DEPLOY.md), then re-run."
  fi
  cp -p "$tpl" "$tpl.bak" 2>/dev/null || true
  [ "$had_ovr" = 1 ] && cp -p "$ovr" "$ovr.bak"
  install -m 0644 "$SRC/infra/gc3d/nginx-gc3d.conf.template" "$tpl"
  cat > "$ovr" <<'EOF'
# Added by infra/gc3d/gc3d-setup.sh: serves gc3d.cloud from the same Nginx. Remove with: gc3d-setup.sh uninstall
services:
  web:
    volumes:
      - ./nginx/extra/gc3d.conf.template:/etc/nginx/templates/gc3d.conf.template:ro
EOF
  if ! out="$(nginx_test 2>&1)"; then
    echo "$out" | tail -n 20
    rm -f "$tpl"; [ -f "$tpl.bak" ] && mv "$tpl.bak" "$tpl"
    if [ "$had_ovr" = 1 ]; then mv "$ovr.bak" "$ovr"; else rm -f "$ovr"; fi
    die "the new Nginx configuration failed its test; nothing was changed on the live site"
  fi
  ok "nginx -t passed with the gc3d block"
  vivid config --quiet || die "compose config with the override is invalid (nothing restarted)"
  # Re-run with an unchanged block: the running web container already has it, so don't restart anything.
  local web; web="$(vivid ps -q web 2>/dev/null || true)"
  if [ -n "$web" ] && docker inspect -f '{{range .Mounts}}{{.Destination}} {{end}}' "$web" | grep -q gc3d.conf.template \
     && cmp -s "$tpl" "$tpl.bak" 2>/dev/null; then
    ok "web already serves this gc3d block"; rm -f "$tpl.bak" "$ovr.bak"; return
  fi
  say "Recreating the live Nginx container (1–2 s)"
  vivid up -d --no-deps --force-recreate web
  local i; for i in $(seq 1 20); do live_ok && break; sleep 1; done
  if ! live_ok; then
    echo "Live site not healthy after the change: restoring the previous Nginx configuration"
    rm -f "$tpl"; [ -f "$tpl.bak" ] && mv "$tpl.bak" "$tpl"
    if [ "$had_ovr" = 1 ]; then mv "$ovr.bak" "$ovr"; else rm -f "$ovr"; fi
    vivid up -d --no-deps --force-recreate web
    for i in $(seq 1 20); do live_ok && break; sleep 1; done
    live_ok && die "restored; the live site is healthy again. Send me: docker logs --tail 50 vivid-web-1" \
            || die "LIVE SITE NOT HEALTHY after restore: run  cd $VIVID && docker compose logs --tail 80 web"
  fi
  rm -f "$tpl.bak" "$ovr.bak"
  ok "$(vivid_domain) healthy after the Nginx change"
}

cmd="${1:-}"
case "$cmd" in
  install)
    EMAIL="${2:?usage: gc3d-setup.sh install <your-email>}"
    [[ "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "that doesn't look like an email address"

    say "1/7 Preflight"
    [ -f "$VIVID/docker-compose.yml" ] && [ -f "$VIVID/.env" ] || die "$VIVID not found: this must run on the vividenginesolutions.com server"
    command -v docker >/dev/null && command -v git >/dev/null && command -v curl >/dev/null || die "docker, git and curl are required"
    docker network inspect vivid_default >/dev/null 2>&1 || die "Docker network vivid_default missing (is the live stack running?)"
    docker volume inspect vivid_certs vivid_acme >/dev/null 2>&1 || die "certificate volumes vivid_certs / vivid_acme missing"
    live_ok || die "$(vivid_domain) is not healthy right now; not changing anything"
    ok "live site $(vivid_domain) healthy"
    ip4="$(curl -fsS --max-time 5 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address)"
    for h in "$DOMAIN" "www.$DOMAIN"; do
      got="$(getent ahostsv4 "$h" | awk 'NR==1{print $1}')"
      [ "$got" = "$ip4" ] || die "$h resolves to '${got:-nothing}', not this server ($ip4). Fix DNS (A gc3d.cloud → $ip4, CNAME www → gc3d.cloud), wait, re-run."
    done
    ok "DNS: $DOMAIN and www.$DOMAIN → $ip4"
    avail_mb="$(free -m | awk '/^Mem:/{print $7}')"; swap_mb="$(free -m | awk '/^Swap:/{print $2}')"
    [ $((avail_mb + swap_mb)) -ge 1400 ] || die "only ${avail_mb} MB memory available (+${swap_mb} MB swap); gc3d needs about 1.2 GB"
    disk_gb="$(df -BG --output=avail / | tail -n1 | tr -dc 0-9)"
    [ "$disk_gb" -ge 5 ] || die "only ${disk_gb} GB disk free; need 5"
    ok "memory ${avail_mb} MB available + ${swap_mb} MB swap, disk ${disk_gb} GB free"

    say "2/7 Code: $SRC ($BRANCH, read-only clone of the public repository)"
    if [ -d "$SRC/.git" ]; then git -C "$SRC" fetch --quiet origin && git -C "$SRC" checkout --quiet -f "origin/$BRANCH"
    else git clone --quiet --branch "$BRANCH" "$REPO_URL" "$SRC"; fi
    ok "$(git -C "$SRC" log -1 --format='%h %s' | cut -c1-80)"

    say "3/7 Settings: $STATE/gc3d.env"
    install -d -m 700 "$STATE" "$STATE/releases" "$STATE/backups"
    if [ ! -f "$STATE/gc3d.env" ]; then
      hex() { openssl rand -hex 32; }
      ( umask 077; cat > "$STATE/gc3d.env" <<EOF
# gc3d.cloud settings (separate from /opt/vivid/infra/.env, which this never touches). After editing, apply with:
#   docker compose -p gc3d --env-file $STATE/gc3d.env -f $SRC/infra/gc3d/compose.yml up -d --no-deps --force-recreate gc3d-app
DOMAIN=$DOMAIN
PUBLIC_ORIGIN=https://$DOMAIN
POSTGRES_USER=gc3d
POSTGRES_PASSWORD=$(hex)
POSTGRES_DB=gc3d
JWT_ACCESS_SECRET=$(hex)
JWT_REFRESH_SECRET=$(hex)
PUBLIC_CLIENT_SECRET=$(hex)
HISTORY_ENCRYPTION_KEY=$(openssl rand -base64 32)
ADMIN_EMAILS=$EMAIL
STAFF_NOTIFY_EMAIL=$EMAIL
STUDIO3D_ENABLED=true
BILLING_MONITOR_JOBS=off
APP_IMAGE=
# Add to turn features on (then recreate gc3d-app, command above):
ANTHROPIC_API_KEY=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
ALERT_WEBHOOK_URL=
EOF
      )
      ok "created with fresh secrets"
    else ok "kept existing settings"; fi

    say "4/7 HTTPS certificate for $DOMAIN + www.$DOMAIN"
    if docker run --rm -v vivid_certs:/etc/letsencrypt:ro alpine:3.20 test -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem"; then
      ok "certificate already present (renewed automatically by the live certbot container)"
    else
      vivid run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/acme \
        -d "$DOMAIN" -d "www.$DOMAIN" --email "$EMAIL" --agree-tos --no-eff-email --non-interactive --keep-until-expiring \
        || die "certificate request failed (DNS not live yet, or port 80 blocked). Nothing else changed; re-run later."
      ok "certificate issued"
    fi

    say "5/7 Nginx: add the gc3d.cloud server block (tested first, auto-revert)"
    install_nginx

    say "6/7 Deploy tools and the GitHub Actions login"
    install -m 0755 "$SRC/infra/gc3d/gc3d-deploy.sh" /usr/local/sbin/gc3d-deploy
    install -m 0755 "$SRC/infra/gc3d/gc3d-ssh-gate.sh" /usr/local/sbin/gc3d-ssh-gate
    install -m 0755 "$SRC/infra/gc3d/error-watch.sh" /usr/local/sbin/gc3d-error-watch
    id gc3d-deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash --comment "GitHub Actions (gc3d deploy only)" gc3d-deploy
    passwd -l gc3d-deploy >/dev/null
    echo 'gc3d-deploy ALL=(root) NOPASSWD: /usr/local/sbin/gc3d-deploy' > /etc/sudoers.d/gc3d-deploy
    chmod 440 /etc/sudoers.d/gc3d-deploy; visudo -cf /etc/sudoers.d/gc3d-deploy >/dev/null || { rm -f /etc/sudoers.d/gc3d-deploy; die "sudoers rule invalid"; }
    # sshd: if an AllowUsers list exists, the deploy user must be on it.
    if sshd -T 2>/dev/null | grep -qi '^allowusers'; then
      grep -qs 'gc3d-deploy' /etc/ssh/sshd_config.d/61-gc3d.conf || { echo "AllowUsers $(sshd -T | awk 'tolower($1)=="allowusers"{$1=""; print}') gc3d-deploy" > /etc/ssh/sshd_config.d/61-gc3d.conf; sshd -t && systemctl reload ssh; }
    fi
    ok "gc3d-deploy user: SSH key only, forced command, one sudo rule"

    say "7/7 Backups, error watch, log rotation"
    # "|| true": grep -v exits 1 when nothing is left, which must not abort the script (set -e, pipefail).
    ( { crontab -l 2>/dev/null | grep -v -e gc3d-backup -e gc3d-error-watch; } || true
      echo "40 3 * * * /usr/local/sbin/gc3d-deploy backup >> /var/log/gc3d-backup.log 2>&1 # gc3d-backup"
      echo "*/5 * * * * /usr/local/sbin/gc3d-error-watch >> /var/log/gc3d-error-watch.log 2>&1 # gc3d-error-watch" ) | crontab -
    cat > /etc/logrotate.d/gc3d <<'EOF'
/var/log/gc3d-*.log /opt/vivid/infra/logs/nginx/gc3d-*.log {
  daily
  rotate 14
  compress
  delaycompress
  missingok
  notifempty
  copytruncate
}
EOF
    ok "nightly dump 03:40 → $STATE/backups (14 days); error watch every 5 min"

    if [ ! -s /home/gc3d-deploy/.ssh/authorized_keys ]; then new_ci_key; print_ci_secrets
    else echo; echo "GitHub Actions key already installed (new one: bash $0 ci-key)."; fi
    cat <<EOF

Done. The live site was not interrupted beyond the Nginx restart.
gc3d.cloud shows "502 Bad Gateway" until the first deploy from GitHub Actions starts the app.
Status any time:  gc3d-deploy status
EOF
    ;;

  ci-key)
    id gc3d-deploy >/dev/null 2>&1 || die "run install first"
    new_ci_key; print_ci_secrets ;;

  uninstall)
    say "Removing gc3d.cloud from Nginx and stopping its containers (database volume and backups are kept)"
    rm -f "$VIVID/nginx/extra/gc3d.conf.template"
    if [ -f "$VIVID/docker-compose.override.yml" ] && grep -q 'gc3d.conf.template' "$VIVID/docker-compose.override.yml"; then
      rm -f "$VIVID/docker-compose.override.yml"
    fi
    vivid up -d --no-deps --force-recreate web
    for i in $(seq 1 20); do live_ok && break; sleep 1; done
    live_ok && ok "$(vivid_domain) healthy" || die "live site not healthy: cd $VIVID && docker compose logs --tail 80 web"
    [ -f "$SRC/infra/gc3d/compose.yml" ] && [ -f "$STATE/gc3d.env" ] && docker compose -p gc3d --env-file "$STATE/gc3d.env" -f "$SRC/infra/gc3d/compose.yml" down || true
    ( { crontab -l 2>/dev/null | grep -v -e gc3d-backup -e gc3d-error-watch; } || true ) | crontab -
    rm -f /etc/sudoers.d/gc3d-deploy /home/gc3d-deploy/.ssh/authorized_keys
    echo "Removed. Kept: $STATE (settings, backups), Docker volume gc3d_gc3d-pgdata, the certificate."
    ;;

  *) die "usage: gc3d-setup.sh install <email> | ci-key | uninstall" ;;
esac
