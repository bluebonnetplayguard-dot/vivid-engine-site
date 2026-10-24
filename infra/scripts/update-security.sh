#!/usr/bin/env bash
# Applies the IP-security update to a Droplet that is already running. Run as root:
#   cd /opt/vivid/infra && bash scripts/update-security.sh
# Safe to run again; every step is idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Nginx log folder for fail2ban"
mkdir -p logs/nginx
chmod 755 logs logs/nginx

echo "==> fail2ban jails and filters"
apt-get install -y fail2ban >/dev/null
install -m 0644 fail2ban/filter.d/vivid-nginx-limit.conf /etc/fail2ban/filter.d/
install -m 0644 fail2ban/filter.d/vivid-nginx-probe.conf /etc/fail2ban/filter.d/
install -m 0644 fail2ban/filter.d/vivid-auth.conf /etc/fail2ban/filter.d/
install -m 0644 fail2ban/jail.local /etc/fail2ban/jail.d/vivid.local
# The jails fail to start if the log file doesn't exist yet.
touch logs/nginx/vivid-access.log logs/nginx/vivid-error.log

echo "==> Firewall: SSH, HTTP, HTTPS only; everything else closed"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
# Rate-limit SSH connection attempts at the firewall too (6 per 30 s per address).
ufw limit OpenSSH >/dev/null || true

echo "==> Restarting Nginx with the new config (the website stays up; app and database are untouched)"
docker compose up -d --force-recreate web
sleep 3
docker compose exec -T web nginx -t

echo "==> Starting fail2ban"
systemctl enable --now fail2ban
systemctl restart fail2ban
sleep 2
fail2ban-client status

echo
echo "Done. Useful commands:"
echo "  fail2ban-client status vivid-nginx-probe     # who is banned"
echo "  fail2ban-client set vivid-auth unbanip 1.2.3.4"
echo "  tail -f /opt/vivid/infra/logs/nginx/vivid-access.log"
