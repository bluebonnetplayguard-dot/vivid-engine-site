#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 24.04 Droplet. Run as root from /opt/vivid/infra:
#   bash scripts/setup-droplet.sh
# Prerequisites: DNS A/AAAA records for the domain and www already point at this Droplet,
# and /opt/vivid/infra/.env is filled in (copy from .env.example).
# SKIP_STACK=1: prepare the server and the certificate but don't build or start the app. Used on servers that
# receive prebuilt images from CI (gc3d.cloud): the first CI deploy starts the stack (docs/GC3D-DEPLOY.md).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Create /opt/vivid/infra/.env first (see .env.example)."; exit 1; }
set -a; source .env; set +a

echo "==> System updates and automatic security patches"
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl ufw fail2ban unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Firewall: SSH, HTTP, HTTPS only (Postgres is never exposed)"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw limit OpenSSH

echo "==> fail2ban: SSH plus web jails (rate-limit abusers, exploit scanners, password guessing)"
mkdir -p logs/nginx && touch logs/nginx/vivid-access.log logs/nginx/vivid-error.log
install -m 0644 fail2ban/filter.d/*.conf /etc/fail2ban/filter.d/
install -m 0644 fail2ban/jail.local /etc/fail2ban/jail.d/vivid.local
systemctl enable --now fail2ban

if ! command -v docker >/dev/null; then
  echo "==> Installing Docker"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

mkdir -p import /opt/vivid/backups

# Small Droplets can run out of memory while building the site; add 2 GB of swap once.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> First HTTPS certificate for $DOMAIN and www.$DOMAIN"
docker compose run --rm -p 80:80 --entrypoint certbot certbot certonly --standalone \
  -d "$DOMAIN" -d "www.$DOMAIN" --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email --non-interactive --keep-until-expiring

if [ "${SKIP_STACK:-}" = 1 ]; then
  echo "==> SKIP_STACK=1: not building or starting the app (CI deploys it)"
else
  echo "==> Starting the stack"
  docker compose up -d --build
fi

echo "==> Nightly database backup at 03:15"
chmod +x scripts/*.sh
( crontab -l 2>/dev/null | grep -v vivid-backup; echo "15 3 * * * /opt/vivid/infra/scripts/backup.sh >> /var/log/vivid-backup.log 2>&1 # vivid-backup" ) | crontab -

echo "Done. Check: docker compose ps   and   curl -s https://$DOMAIN/api/health"
