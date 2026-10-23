#!/usr/bin/env bash
# Vivid Engine Solutions: one-command install on a fresh Ubuntu 24.04 DigitalOcean Droplet.
#
#   1. Upload:   scp vivid-engine-droplet.tar.gz root@YOUR_DROPLET_IP:/root/
#   2. Unpack:   ssh root@YOUR_DROPLET_IP
#                tar -xzf vivid-engine-droplet.tar.gz && cd vivid-engine
#   3. Install:  bash install.sh
#
# Safe to run again for updates: it keeps /opt/vivid/infra/.env, your imports and the database.
set -euo pipefail

TARGET=/opt/vivid
HERE="$(cd "$(dirname "$0")" && pwd)"

say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root (or with sudo): sudo bash install.sh"
[ -f "$HERE/Dockerfile" ] && [ -d "$HERE/backend" ] && [ -d "$HERE/site" ] && [ -d "$HERE/infra" ] \
  || die "Run this from the unpacked vivid-engine folder."
if [ -r /etc/os-release ]; then
  . /etc/os-release
  [ "${ID:-}" = "ubuntu" ] || warn "This was written for Ubuntu 24.04; you are on ${PRETTY_NAME:-unknown}. Continuing."
fi

say "Copying the app to $TARGET"
mkdir -p "$TARGET"
if [ "$HERE" != "$TARGET" ]; then
  # Replace code folders, keep server-only files (.env, import/, backups/).
  for item in Dockerfile .dockerignore backend site infra docs .do README.md build-studio; do
    [ -e "$HERE/$item" ] || continue
    if [ "$item" = "infra" ] && [ -d "$TARGET/infra" ]; then
      KEEP="$(mktemp -d)"
      [ -f "$TARGET/infra/.env" ] && cp -p "$TARGET/infra/.env" "$KEEP/.env"
      [ -d "$TARGET/infra/import" ] && cp -rp "$TARGET/infra/import" "$KEEP/import"
      rm -rf "$TARGET/infra"
      cp -r "$HERE/infra" "$TARGET/infra"
      [ -f "$KEEP/.env" ] && mv "$KEEP/.env" "$TARGET/infra/.env"
      [ -d "$KEEP/import" ] && rm -rf "$TARGET/infra/import" && mv "$KEEP/import" "$TARGET/infra/import"
      rm -rf "$KEEP"
    else
      rm -rf "${TARGET:?}/$item"
      cp -r "$HERE/$item" "$TARGET/$item"
    fi
  done
fi
cd "$TARGET/infra"
# Files edited on Windows can carry CRLF line endings, which break shell scripts.
sed -i 's/\r$//' scripts/*.sh .env.example nginx/templates/*.template 2>/dev/null || true
chmod +x scripts/*.sh

ENV_FILE="$TARGET/infra/.env"
if [ ! -f "$ENV_FILE" ]; then
  say "First-time settings (press Enter to accept the value in brackets)"
  read -r -p "Website domain [vividenginesolutions.com]: " DOMAIN
  DOMAIN="${DOMAIN:-vividenginesolutions.com}"
  read -r -p "Admin email (gets the admin role when it signs up) [info@$DOMAIN]: " ADMIN
  ADMIN="${ADMIN:-info@$DOMAIN}"
  read -r -p "Email for HTTPS certificate notices [$ADMIN]: " LE_EMAIL
  LE_EMAIL="${LE_EMAIL:-$ADMIN}"
  command -v openssl >/dev/null || { apt-get update -y && apt-get install -y openssl; }
  secret() { openssl rand -hex 32; }

  cp .env.example "$ENV_FILE"
  set_var() { # set KEY=VALUE in .env (value is hex/email/domain, safe for sed with | delimiter)
    if grep -q "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi
  }
  set_var DOMAIN "$DOMAIN"
  set_var PUBLIC_ORIGIN "https://$DOMAIN"
  set_var LETSENCRYPT_EMAIL "$LE_EMAIL"
  set_var ADMIN_EMAILS "$ADMIN"
  set_var STAFF_NOTIFY_EMAIL "$ADMIN"
  set_var POSTGRES_PASSWORD "$(secret)"
  set_var JWT_ACCESS_SECRET "$(secret)"
  set_var JWT_REFRESH_SECRET "$(secret)"
  set_var PUBLIC_CLIENT_SECRET "$(secret)"
  chmod 600 "$ENV_FILE"
  echo "Saved $ENV_FILE with new random secrets."
  warn "Email (SMTP), Stripe, Claude, Google sign-in and other keys are blank for now."
  warn "Add them later with:  nano $ENV_FILE   then:  cd $TARGET/infra && docker compose up -d app"
else
  say "Keeping existing settings in $ENV_FILE"
fi
chmod 600 "$ENV_FILE"
set -a; . "$ENV_FILE"; set +a
[ -n "${DOMAIN:-}" ] || die "DOMAIN is empty in $ENV_FILE"

if docker compose ps --services --status running 2>/dev/null | grep -qx app; then
  say "Existing installation found: updating"
  bash scripts/deploy.sh
  echo
  echo "Done. Check: curl -s https://$DOMAIN/api/health"
  exit 0
fi

say "Checking DNS for $DOMAIN"
MY_IP="$(curl -4 -fsS --max-time 10 https://api.ipify.org || curl -4 -fsS --max-time 10 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address || true)"
DNS_IP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
echo "This server: ${MY_IP:-unknown}    $DOMAIN points to: ${DNS_IP:-nothing yet}"
if [ -z "$MY_IP" ] || [ "$MY_IP" != "$DNS_IP" ]; then
  warn "The domain does not point at this server yet, so the HTTPS certificate cannot be issued."
  warn "Set the A record for $DOMAIN and www.$DOMAIN to ${MY_IP:-the Droplet IP address} (see docs/DNS.md),"
  warn "wait until it resolves, then run this installer again. Nothing else has been changed."
  exit 1
fi

say "Installing and starting (this takes a few minutes the first time)"
bash scripts/setup-droplet.sh

echo
echo "Installed. Open https://$DOMAIN"
echo "Next steps:"
echo "  1. Sign up on the site with $ADMIN_EMAILS (needs SMTP set in .env to receive the code)."
echo "  2. Add your keys:  nano $ENV_FILE   then  docker compose up -d app"
echo "  3. Import Base44 data: see docs/DEPLOY.md, step 4."
