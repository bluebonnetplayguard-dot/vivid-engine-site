#!/usr/bin/env bash
# GitHub side of the gc3d.cloud pipeline, with the GitHub CLI (gh auth login as a repository admin).
#
#   bash infra/gc3d/github-setup.sh <server-ipv4>
#
# 1. Environment "gc3d-staging": deploys only from staging/gc3d and main; variables GC3D_HOST, GC3D_IPV4,
#    GC3D_SSH_USER=gc3d-deploy (the two secrets are pasted by you: gc3d-setup.sh prints them; docs/GC3D-DEPLOY.md)
# 2. Branch staging/gc3d (created at the current studio branch if missing), protected: no force-push, no deletion,
#    CI must pass on pull requests into it
# 3. Branch protection on main: pull request + green CI required, no force-push, no deletion
# 4. Repository variable GC3D_DEPLOY_BRANCH=staging/gc3d
set -euo pipefail
REPO=bluebonnetplayguard-dot/vivid-engine-site
IP4="${1:?usage: github-setup.sh <server-ipv4>}"
SOURCE_BRANCH="${SOURCE_BRANCH:-infra/gc3d-deploy}"
say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
gh auth status >/dev/null 2>&1 || { echo "Run: gh auth login"; exit 1; }

# Required checks = the CI job names (.github/workflows/ci.yml).
CHECKS='["Secret scan (gitleaks)","Website (lint, names, build)","API (build, tests)","Docker image, smoke test and repo checks (scripts/verify-release.sh)"]'

say "Deploy branch staging/gc3d"
if ! gh api "repos/$REPO/branches/staging%2Fgc3d" >/dev/null 2>&1; then
  sha="$(gh api "repos/$REPO/git/ref/heads/$SOURCE_BRANCH" --jq .object.sha)"
  gh api "repos/$REPO/git/refs" -f ref=refs/heads/staging/gc3d -f sha="$sha" >/dev/null
  echo "created at $SOURCE_BRANCH ($sha)"
fi

say "Environment gc3d-staging (deploys only from staging/gc3d and main)"
gh api -X PUT "repos/$REPO/environments/gc3d-staging" --input - >/dev/null <<'EOF'
{ "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true } }
EOF
for b in staging/gc3d main; do
  gh api "repos/$REPO/environments/gc3d-staging/deployment-branch-policies" -f name="$b" -f type=branch >/dev/null 2>&1 || true
done
setvar() { gh variable set "$1" --env gc3d-staging --repo "$REPO" --body "$2"; echo "  $1=$2"; }
setvar GC3D_HOST "$IP4"
setvar GC3D_IPV4 "$IP4"
setvar GC3D_SSH_USER gc3d-deploy
gh variable set GC3D_DEPLOY_BRANCH --repo "$REPO" --body staging/gc3d && echo "  GC3D_DEPLOY_BRANCH=staging/gc3d (repository)"

say "Protect staging/gc3d and main"
protect() {   # protect <branch> <require-pr: true|false>
  local reviews='null'
  [ "$2" = true ] && reviews='{"required_approving_review_count":0,"dismiss_stale_reviews":true}'
  gh api -X PUT "repos/$REPO/branches/$(printf %s "$1" | sed 's#/#%2F#g')/protection" --input - >/dev/null <<EOF
{
  "required_status_checks": { "strict": false, "contexts": $CHECKS },
  "enforce_admins": false,
  "required_pull_request_reviews": $reviews,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false,
  "required_conversation_resolution": true
}
EOF
  echo "  $1 protected"
}
protect main true
protect staging/gc3d false

cat <<EOF

GitHub is ready. Still to do by hand (secrets are never passed through scripts or chat):
  Settings > Environments > gc3d-staging > Add secret
    GC3D_SSH_KEY       printed once by gc3d-setup.sh on the server
    GC3D_KNOWN_HOSTS   printed by gc3d-setup.sh
Then deploy:  git push origin <commit>:staging/gc3d   (or re-run the latest "Deploy gc3d.cloud" workflow)
EOF
