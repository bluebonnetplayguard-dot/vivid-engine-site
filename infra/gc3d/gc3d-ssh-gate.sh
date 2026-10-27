#!/usr/bin/env bash
# The only thing GitHub Actions can run on the shared Droplet. Installed as /usr/local/sbin/gc3d-ssh-gate and forced
# for the CI key in /home/gc3d-deploy/.ssh/authorized_keys:
#   restrict,command="/usr/local/sbin/gc3d-ssh-gate" ssh-ed25519 AAAA... github-actions@gc3d.cloud
# "restrict" turns off port/agent/X11 forwarding and the TTY. Whatever command the client asks for arrives in
# SSH_ORIGINAL_COMMAND; only these forms pass, each checked strictly, and then run through one sudo rule:
#   deploy <40-hex sha> ghcr.io/bluebonnetplayguard-dot/vivid-engine-site[:tag][@sha256:...] <github-user>
#   rollback <github-user>
#   status
# Anything else is refused and logged. The CI key cannot open a shell, read files, or touch the live site.
set -euo pipefail
cmd="${SSH_ORIGINAL_COMMAND:-}"
from="${SSH_CLIENT:-local}"; logger -t gc3d-ssh-gate "request from ${from%% *}: ${cmd:0:200}" 2>/dev/null || true
read -r -a a <<<"$cmd"
user_re='^[A-Za-z0-9-]{1,39}(\[bot\])?$'
image_re='^ghcr\.io/bluebonnetplayguard-dot/vivid-engine-site(:[A-Za-z0-9._-]+)?(@sha256:[0-9a-f]{64})?$'
case "${a[0]:-}" in
  deploy)
    [ "${#a[@]}" = 4 ] && [[ "${a[1]}" =~ ^[0-9a-f]{40}$ ]] && [[ "${a[2]}" =~ $image_re ]] && [[ "${a[3]}" =~ $user_re ]] \
      || { echo "refused: bad deploy arguments" >&2; exit 2; }
    exec sudo -n /usr/local/sbin/gc3d-deploy deploy "${a[1]}" "${a[2]}" "${a[3]}" ;;
  rollback)
    [ "${#a[@]}" = 2 ] && [[ "${a[1]}" =~ $user_re ]] || { echo "refused: bad rollback arguments" >&2; exit 2; }
    exec sudo -n /usr/local/sbin/gc3d-deploy rollback "${a[1]}" ;;
  status)
    [ "${#a[@]}" = 1 ] || { echo "refused" >&2; exit 2; }
    exec sudo -n /usr/local/sbin/gc3d-deploy status </dev/null ;;
  *)
    echo "refused: only deploy, rollback and status are allowed" >&2; exit 2 ;;
esac
