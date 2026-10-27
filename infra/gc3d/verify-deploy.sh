#!/usr/bin/env bash
# Checks a live deployment from the OUTSIDE, the way a visitor reaches it. Runs anywhere with bash, curl, openssl
# and dig (GitHub Actions runners, the Droplet, WSL, macOS).
#
#   bash infra/scripts/verify-deploy.sh gc3d.cloud
#   EXPECT_IP=203.0.113.10 EXPECT_NOINDEX=1 EXPECT_HOME=/studio bash infra/scripts/verify-deploy.sh gc3d.cloud
#
# Optional:
#   EXPECT_IP        IPv4 the A record must point to
#   EXPECT_IP6       IPv6 the AAAA record must point to
#   EXPECT_NOINDEX   1 = every page must send X-Robots-Tag: noindex (staging / second domains)
#   EXPECT_HOME      path "/" must redirect to (e.g. /studio)
#   MIN_CERT_DAYS    days the certificate must still be valid (default 14)
#   RETRIES          attempts for the health check, 5 s apart (default 12; covers a container restart)
# Exit codes: 0 = every check passed
#             1 = a RELEASE check failed (health, pages, assets, app headers, redirects): rolling back can help
#             3 = only INFRASTRUCTURE checks failed (DNS, certificate, TLS): a rollback would not change them
# Each failure is printed (and annotated in GitHub Actions).
set -uo pipefail

DOMAIN="${1:?usage: verify-deploy.sh <domain>}"
[[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || { echo "bad domain: $DOMAIN"; exit 2; }
BASE="https://$DOMAIN"
MIN_CERT_DAYS="${MIN_CERT_DAYS:-14}"
RETRIES="${RETRIES:-12}"
fails=0; release_fails=0
KIND=infra                      # which kind of check is running; set per section below
pass() { printf '  \033[32mPASS\033[0m  %s\n' "$*"; }
fail() {
  printf '  \033[31mFAIL\033[0m  %s\n' "$*"; fails=$((fails + 1)); [ "$KIND" = release ] && release_fails=$((release_fails + 1))
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::error::verify-deploy ($KIND): $*"; fi
  return 0
}
section() { printf '\n%s\n' "$*"; }
hdr() { curl -sS -o /dev/null -D - --max-time 15 "$@" | tr -d '\r'; }       # response headers only
header_of() { grep -i "^$1:" | head -n1 | cut -d: -f2- | sed 's/^ *//'; }

section "DNS"
a="$(dig +short A "$DOMAIN" | tail -n1)"; aaaa="$(dig +short AAAA "$DOMAIN" | tail -n1)"
www="$(dig +short A "www.$DOMAIN" | tail -n1)"
[ -n "$a" ] && pass "A $DOMAIN -> $a" || fail "no A record for $DOMAIN"
if [ -n "${EXPECT_IP:-}" ]; then [ "$a" = "$EXPECT_IP" ] && pass "A record is the Droplet ($EXPECT_IP)" || fail "A record is '$a', expected $EXPECT_IP"; fi
if [ -n "${EXPECT_IP6:-}" ]; then [ "$aaaa" = "$EXPECT_IP6" ] && pass "AAAA record is the Droplet ($EXPECT_IP6)" || fail "AAAA record is '$aaaa', expected $EXPECT_IP6"; fi
[ -n "$www" ] && pass "www.$DOMAIN resolves ($www)" || fail "www.$DOMAIN does not resolve"
caa="$(dig +short CAA "$DOMAIN")"
grep -q letsencrypt.org <<<"$caa" && pass "CAA allows only Let's Encrypt" || fail "no CAA record for letsencrypt.org"

KIND=release
section "Health (through Nginx and TLS)"
ok=""
for i in $(seq 1 "$RETRIES"); do
  body="$(curl -fsS --max-time 10 "$BASE/api/health" 2>/dev/null || true)"
  if [ "$body" = '{"ok":true}' ]; then ok=1; break; fi
  sleep 5
done
[ -n "$ok" ] && pass "GET /api/health -> {\"ok\":true} (app and database up)" || fail "GET /api/health did not return {\"ok\":true} after $RETRIES tries (last: ${body:-no response})"
t="$(curl -o /dev/null -sS -w '%{time_total}' --max-time 15 "$BASE/api/health" 2>/dev/null || echo 99)"
awk -v t="$t" 'BEGIN{exit !(t < 2.0)}' && pass "health responds in ${t}s" || fail "health is slow: ${t}s"

KIND=infra
section "TLS certificate"
cert="$(echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null | openssl x509 -noout -issuer -enddate -ext subjectAltName 2>/dev/null)"
if [ -z "$cert" ]; then fail "could not read the certificate"; else
  grep -qi "Let's Encrypt" <<<"$cert" && pass "issued by Let's Encrypt" || fail "issuer is not Let's Encrypt: $(grep -i issuer <<<"$cert")"
  grep -q "DNS:$DOMAIN" <<<"$cert" && grep -q "DNS:www.$DOMAIN" <<<"$cert" && pass "covers $DOMAIN and www.$DOMAIN" || fail "certificate names: $(grep DNS: <<<"$cert" | xargs)"
  end="$(grep notAfter <<<"$cert" | cut -d= -f2)"
  days=$(( ( $(date -d "$end" +%s 2>/dev/null || date -j -f '%b %e %T %Y %Z' "$end" +%s) - $(date +%s) ) / 86400 ))
  [ "$days" -ge "$MIN_CERT_DAYS" ] && pass "valid for $days more days (renewal is automatic at 30)" || fail "certificate expires in $days days"
fi
echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" -tls1_1 >/dev/null 2>&1 && fail "TLS 1.1 is accepted" || pass "TLS 1.0/1.1 refused"
echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" -tls1_3 >/dev/null 2>&1 && pass "TLS 1.3 offered" || fail "TLS 1.3 not offered"
curl -fsS --http2 -o /dev/null -w '%{http_version}' --max-time 15 "$BASE/api/health" 2>/dev/null | grep -q '^2' && pass "HTTP/2" || fail "HTTP/2 not negotiated"

KIND=release
section "Redirects"
loc="$(hdr "http://$DOMAIN/some/page?x=1" | header_of location)"
[ "$loc" = "$BASE/some/page?x=1" ] && pass "http -> https (path and query kept)" || fail "http redirect goes to '$loc'"
loc="$(hdr "https://www.$DOMAIN/x" | header_of location)"
[ "$loc" = "$BASE/x" ] && pass "www -> apex" || fail "www redirect goes to '$loc'"
if [ -n "${EXPECT_HOME:-}" ]; then
  h="$(hdr "$BASE/")"; loc="$(header_of location <<<"$h")"
  [ "$loc" = "$EXPECT_HOME" ] || [ "$loc" = "$BASE$EXPECT_HOME" ] && pass "/ -> $EXPECT_HOME" || fail "/ redirects to '$loc', expected $EXPECT_HOME"
fi

section "Pages and assets"
code="$(curl -sS -o /tmp/verify-studio.html -w '%{http_code}' --max-time 15 "$BASE/studio")"
[ "$code" = 200 ] && grep -qi '<div id="root"' /tmp/verify-studio.html && pass "/studio serves the app (200)" || fail "/studio returned $code"
asset="$(grep -oE '/assets/[A-Za-z0-9._-]+\.js' /tmp/verify-studio.html | head -n1)"
if [ -n "$asset" ]; then
  h="$(hdr -H 'Accept-Encoding: gzip' "$BASE$asset")"
  grep -qi '^cache-control:.*immutable' <<<"$h" && pass "hashed assets cached for a year" || fail "asset $asset has no immutable cache header"
  grep -qi '^content-encoding: gzip' <<<"$h" && pass "assets gzip-compressed" || fail "asset $asset not compressed"
else fail "no /assets/*.js referenced by /studio"; fi
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/this-page-does-not-exist-$RANDOM")"
[ "$code" = 404 ] && pass "unknown page -> 404" || fail "unknown page -> $code"

section "Security headers"
h="$(hdr "$BASE/studio")"
for want in "strict-transport-security:max-age=63072000" "x-content-type-options:nosniff" "x-frame-options:SAMEORIGIN" "referrer-policy:strict-origin-when-cross-origin"; do
  name="${want%%:*}"; val="${want#*:}"
  got="$(header_of "$name" <<<"$h")"
  [[ "$got" == *"$val"* ]] && pass "$name: $got" || fail "$name is '${got:-missing}'"
done
grep -qi '^server: nginx/' <<<"$h" && fail "Nginx version is exposed" || pass "server version hidden"
robots="$(header_of x-robots-tag <<<"$h")"
if [ "${EXPECT_NOINDEX:-}" = 1 ]; then
  [[ "$robots" == *noindex* ]] && pass "X-Robots-Tag: $robots (kept out of search)" || fail "X-Robots-Tag is '${robots:-missing}', expected noindex"
fi
curl -sS -o /dev/null --max-time 10 "$BASE/wp-login.php" 2>/dev/null; rc=$?
[ "$rc" = 52 ] && pass "exploit probes are dropped (444)" || fail "probe /wp-login.php was answered (curl exit $rc)"

printf '\n'
if [ "$fails" -eq 0 ]; then echo "All checks passed for $DOMAIN."; exit 0; fi
echo "$fails check(s) failed for $DOMAIN ($release_fails of them release checks)."
[ "$release_fails" -gt 0 ] && exit 1 || exit 3
