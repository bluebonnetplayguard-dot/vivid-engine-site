#!/usr/bin/env bash
# Creates the gc3d.cloud infrastructure on DigitalOcean with doctl. Idempotent: each step checks before creating.
# Runs on your PC (Windows: WSL or Git Bash), never on a server.
#
#   doctl auth init                 # paste a DigitalOcean API token with write scope (Account > API > Generate)
#   bash infra/gc3d/provision.sh you@example.com
#
# Creates:
#   1. Droplet gc3d-1: Ubuntu 24.04, 2 vCPU / 4 GB / 80 GB (s-2vcpu-4gb, $24/mo), IPv6, monitoring agent, user data
#      from infra/gc3d/cloud-init.yaml. Your DigitalOcean SSH keys are added for root (console access always works too).
#   2. Cloud Firewall gc3d-web: in = 22, 80, 443 and ping (IPv4 + IPv6); out = all. Postgres is never reachable.
#   3. DNS zone gc3d.cloud with the records in docs/GC3D-DEPLOY.md (step 2) (A, AAAA, www CNAME, CAA, SPF, DMARC, null MX)
#   4. Uptime check on https://gc3d.cloud/api/health with down + SSL-expiry alerts, and CPU / memory / disk alerts
#
# Environment overrides: REGION (default nyc3), SIZE (default s-2vcpu-4gb), BACKUPS=1 (weekly Droplet backups, +20%).
# The nameservers at Porkbun are changed by hand (docs/GC3D-DEPLOY.md step 3): Porkbun has no doctl.
set -euo pipefail
cd "$(dirname "$0")"
EMAIL="${1:?usage: provision.sh <alert-email>}"
DOMAIN=gc3d.cloud
NAME=gc3d-1
REGION="${REGION:-nyc3}"
SIZE="${SIZE:-s-2vcpu-4gb}"
IMAGE=ubuntu-24-04-x64
TAG=gc3d
say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
command -v doctl >/dev/null || { echo "Install doctl: https://docs.digitalocean.com/reference/doctl/how-to/install/"; exit 1; }
doctl account get >/dev/null || { echo "Run: doctl auth init"; exit 1; }

say "1/4 Droplet $NAME ($SIZE in $REGION)"
id="$(doctl compute droplet list --tag-name "$TAG" --format ID,Name --no-header | awk -v n="$NAME" '$2==n {print $1}')"
if [ -z "$id" ]; then
  keys="$(doctl compute ssh-key list --format ID --no-header | paste -sd, -)"
  args=(--region "$REGION" --size "$SIZE" --image "$IMAGE" --tag-names "$TAG" --enable-ipv6 --enable-monitoring
        --user-data-file cloud-init.yaml --wait --format ID --no-header)
  [ -n "$keys" ] && args+=(--ssh-keys "$keys")
  [ "${BACKUPS:-}" = 1 ] && args+=(--enable-backups)
  id="$(doctl compute droplet create "$NAME" "${args[@]}")"
fi
ip4="$(doctl compute droplet get "$id" --format PublicIPv4 --no-header)"
ip6="$(doctl compute droplet get "$id" --format PublicIPv6 --no-header)"
echo "Droplet $id: $ip4 / ${ip6:-no IPv6}"

say "2/4 Cloud Firewall gc3d-web"
fw="$(doctl compute firewall list --format ID,Name --no-header | awk '$2=="gc3d-web" {print $1}')"
any="address:0.0.0.0/0,address:::/0"
if [ -z "$fw" ]; then
  fw="$(doctl compute firewall create --name gc3d-web \
    --inbound-rules "protocol:tcp,ports:22,$any protocol:tcp,ports:80,$any protocol:tcp,ports:443,$any protocol:icmp,$any" \
    --outbound-rules "protocol:tcp,ports:all,$any protocol:udp,ports:all,$any protocol:icmp,$any" \
    --tag-names "$TAG" --format ID --no-header)"
fi
echo "Firewall $fw applies to every Droplet tagged $TAG"

say "3/4 DNS zone $DOMAIN"
doctl compute domain get "$DOMAIN" >/dev/null 2>&1 || doctl compute domain create "$DOMAIN" >/dev/null
existing="$(doctl compute domain records list "$DOMAIN" --format Type,Name,Data --no-header)"
rec() {   # rec TYPE NAME DATA TTL [extra flags]: create unless an identical record exists
  local type="$1" name="$2" data="$3" ttl="$4"; shift 4
  if awk -v t="$type" -v n="$name" -v d="$data" '$1==t && $2==n && index($0,d) {f=1} END {exit !f}' <<<"$existing"; then
    echo "  = $type $name $data"; return
  fi
  doctl compute domain records create "$DOMAIN" --record-type "$type" --record-name "$name" --record-data "$data" --record-ttl "$ttl" "$@" >/dev/null
  echo "  + $type $name $data (TTL $ttl)"
}
rec A     @    "$ip4" 300
[ -n "$ip6" ] && rec AAAA @ "$ip6" 300
rec CNAME www  "$DOMAIN." 300
rec CAA   @    "letsencrypt.org" 3600 --record-flags 0 --record-tag issue
rec CAA   @    ";" 3600 --record-flags 0 --record-tag issuewild
rec CAA   @    "mailto:$EMAIL" 3600 --record-flags 0 --record-tag iodef
# No mail is sent or received as @gc3d.cloud yet: tell every mail server so, which stops spoofing of the name.
rec TXT   @      "v=spf1 -all" 3600
rec TXT   _dmarc "v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s" 3600
rec MX    @      "." 3600 --record-priority 0 || echo "  ! null MX not accepted by the API; add it in the control panel or skip it (SPF -all and DMARC reject already block spoofing)"

say "4/4 Monitoring and alerts (to $EMAIL)"
up="$(doctl monitoring uptime list --format ID,Name --no-header | awk '$2=="gc3d-health" {print $1}')"
if [ -z "$up" ]; then
  up="$(doctl monitoring uptime create gc3d-health --target "https://$DOMAIN/api/health" --type https \
        --regions us_east,us_west,eu_west --format ID --no-header)"
  doctl monitoring uptime alert create "$up" --name "gc3d down" --type down --period 2m --emails "$EMAIL" >/dev/null
  doctl monitoring uptime alert create "$up" --name "gc3d certificate expiring" --type ssl_expiry --threshold 14 --period 2m --emails "$EMAIL" >/dev/null
  doctl monitoring uptime alert create "$up" --name "gc3d slow" --type latency --comparison greater_than --threshold 2000 --period 10m --emails "$EMAIL" >/dev/null
fi
for spec in "cpu:85:CPU above 85%" "memory_utilization_percent:90:Memory above 90%" "disk_utilization_percent:85:Disk above 85%"; do
  metric="${spec%%:*}"; rest="${spec#*:}"; value="${rest%%:*}"; desc="${rest#*:}"
  doctl monitoring alert list --format Description --no-header | grep -qx "gc3d: $desc" && continue
  doctl monitoring alert create --type "v1/insights/droplet/$metric" --compare GreaterThan --value "$value" --window 10m \
    --entities "$id" --emails "$EMAIL" --description "gc3d: $desc" >/dev/null
  echo "  + alert: $desc"
done

cat <<EOF

Done.
  Droplet   $NAME  $ip4  ${ip6:-}
  Next      Porkbun > gc3d.cloud > Details > Authoritative Nameservers:
              ns1.digitalocean.com  ns2.digitalocean.com  ns3.digitalocean.com
            then wait for:  dig +short NS $DOMAIN   (shows the three digitalocean.com servers)
  Then      docs/GC3D-DEPLOY.md step 4 (deploy key) and step 5 (gc3d-bootstrap in the Droplet console).
EOF
