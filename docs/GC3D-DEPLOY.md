# gc3d.cloud: deployment runbook

The GC platform (website, API, GC 3D Design Studio) runs at **https://gc3d.cloud** on the **same Droplet as
vividenginesolutions.com** (162.243.169.89), as a separate Docker project with its **own app container and its own
database**. The two sites share only the Droplet and the Nginx front door. gc3d.cloud is a staging site: every
response says `X-Robots-Tag: noindex, nofollow`, and `/` opens `/studio`.

```
                       Droplet 162.243.169.89 (Ubuntu, Docker)
 internet ─► :80/:443 ─► web (Nginx, project "vivid") ─┬─► app        vividenginesolutions.com  (unchanged)
                          │ certbot renews all certs    │   postgres   its database               (unchanged)
                          │                             │
                          └ gc3d.conf (added) ──────────┴─► gc3d-app   gc3d.cloud  (project "gc3d", mem ≤ 1 GB)
                                                              └─ gc3d-db  own PostgreSQL 16 (private network, ≤ 512 MB)

 GitHub: push to staging/gc3d ─► CI ─► image ghcr.io/…:sha-<commit> ─► SSH as gc3d-deploy (forced command)
         ─► gc3d-deploy: dump DB, pull, swap gc3d-app, health check, auto-rollback ─► verify from the internet
```

## What changes on the live server, and what doesn't

| Changed | Not touched |
|---|---|
| New file `/opt/vivid/infra/docker-compose.override.yml` (one volume line for `web`) | The live app, its database and `/opt/vivid/infra/.env` |
| New file `/opt/vivid/infra/nginx/extra/gc3d.conf` (mounted read-only as `/etc/nginx/conf.d/gc3d.conf`) | `/opt/vivid/infra/nginx/templates/default.conf.template` |
| The `web` container is recreated once (1–2 s) | The certbot container (it simply renews one more certificate) |
| New: `/opt/gc3d` (code), `/var/lib/gc3d` (settings, backups, release history) | Firewall, SSH settings for existing users, existing cron jobs |
| New: user `gc3d-deploy`, `/usr/local/sbin/gc3d-*`, two cron lines, `/etc/logrotate.d/gc3d` | |

**Safeguards for the live site**

- Nginx looks up the gc3d app when a request arrives, not at startup. If gc3d is stopped, broken or not deployed
  yet, Nginx still starts and vividenginesolutions.com still works; gc3d.cloud just shows 502.
- `gc3d-setup.sh` checks things before changing them:
  - it stops if the live site isn't healthy, or DNS isn't ready
  - it tests the complete new Nginx configuration in a throwaway container (`nginx -t`) before touching the live one
  - after the restart it checks vividenginesolutions.com and puts the old configuration back on its own if the site
    isn't healthy
- gc3d's containers have memory and CPU caps, so gc3d can't starve the live site.
- GitHub Actions' key can't open a shell. It can only ask for `deploy`, `rollback` or `status` of gc3d. Each request
  is checked against a strict pattern and runs one fixed script through a single sudo rule.
- `bash /root/gc3d-setup.sh uninstall` removes gc3d from Nginx and stops it. Its database volume and backups are kept.

## 1. DNS (Porkbun: Domain Management > gc3d.cloud > DNS Records)

Delete Porkbun's default parking records, and any GitHub Pages records (`185.199.108–111.153`, `2606:50c0:800x::153`,
`USERNAME.github.io`). Then the zone must be exactly:

| Type | Host | Answer | TTL |
|---|---|---|---|
| A | *(blank)* | `162.243.169.89` | 600 |
| CNAME | `www` | `gc3d.cloud` | 600 |
| CAA | *(blank)* | `0 issue "letsencrypt.org"` | 3600 |
| CAA | *(blank)* | `0 issuewild ";"` | 3600 |
| TXT | *(blank)* | `v=spf1 -all` | 3600 |
| TXT | `_dmarc` | `v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s` | 3600 |

Notes:
- **No AAAA record.** The Droplet has no IPv6 address.
- **No MX record.** No mail is sent or received as @gc3d.cloud. The SPF and DMARC records tell mail servers to reject
  anything that pretends to be from it.
- **Porkbun DNSSEC stays off.**
- **Nameservers stay at Porkbun.** Nothing to change there.

Check it from Windows:

```
nslookup gc3d.cloud 1.1.1.1          → 162.243.169.89
nslookup www.gc3d.cloud 1.1.1.1      → gc3d.cloud, 162.243.169.89
nslookup -type=CAA gc3d.cloud 1.1.1.1
```

## 2. Server setup (once, in the Droplet console as root)

DigitalOcean > Droplets > `ubuntu-s-2vcpu-4gb-nyc1` > **Console**, then:

```bash
curl -fsSL https://raw.githubusercontent.com/bluebonnetplayguard-dot/vivid-engine-site/staging/gc3d/infra/gc3d/gc3d-setup.sh -o /root/gc3d-setup.sh
bash /root/gc3d-setup.sh install you@example.com
```

Steps (each one checks first, and re-running is safe):

1. **Preflight**: the live site is healthy, gc3d.cloud and www point at this server, memory is about 1.4 GB
   including swap, and 5 GB of disk is free.
2. **Code**: `/opt/gc3d`, a read-only clone of the public repository, branch `staging/gc3d`.
3. **Settings**: `/var/lib/gc3d/gc3d.env` (mode 600), with its own database password, JWT keys and encryption key.
4. **HTTPS certificate** for gc3d.cloud and www, issued through the live site's existing challenge path, with no
   downtime. The certbot container renews it with the others.
5. **Nginx**: the gc3d server block, with test → recreate → check → auto-restore.
6. **Deploy access**:
   - `/usr/local/sbin/gc3d-deploy`, `gc3d-ssh-gate` and `gc3d-error-watch`
   - user `gc3d-deploy` with a forced-command key and one sudo rule
7. **Cron and logs**:
   - gc3d database dump at 03:40, kept 14 days
   - error watch every 5 minutes
   - log rotation

At the end it prints the GitHub values for step 3, including the **private key, once**. After you press Enter, the
private key is deleted from the server. To make a new key later: `bash /root/gc3d-setup.sh ci-key`.

Until the first deploy, gc3d.cloud shows *502 Bad Gateway*. That's expected.

## 3. GitHub settings

**Settings > Environments > New environment** `gc3d-staging`:

| Kind | Name | Value |
|---|---|---|
| Deployment branches | Selected branches | `staging/gc3d`, `main` |
| Secret | `GC3D_SSH_KEY` | printed by gc3d-setup (`-----BEGIN OPENSSH PRIVATE KEY-----` … `-----END …-----`, every line) |
| Secret | `GC3D_KNOWN_HOSTS` | the `162.243.169.89 ssh-ed25519 …` (and `ecdsa …`) lines it printed |
| Variable | `GC3D_HOST` | `162.243.169.89` |
| Variable | `GC3D_IPV4` | `162.243.169.89` |
| Variable | `GC3D_SSH_USER` | `gc3d-deploy` |

**Settings > Secrets and variables > Actions > Variables (Repository):** `GC3D_DEPLOY_BRANCH` = `staging/gc3d`.
Until this variable exists, pushes don't deploy. Change it to `main` once the studio PRs are merged.

**Settings > Branches**:

| Branch | Protection |
|---|---|
| `main` | Require a pull request. Required checks: *Secret scan (gitleaks)*, *Website (lint, names, build)*, *API (build, tests)*, *Docker image, smoke test and repo checks (scripts/verify-release.sh)*. Require conversation resolution. Block force-pushes and deletion. |
| `staging/gc3d` | The same four required checks, so only commits that passed CI can land. Block force-pushes and deletion. |

`bash infra/gc3d/github-setup.sh 162.243.169.89` sets all of the above except the two secrets, using the GitHub CLI
as an admin. You paste the secrets yourself; they never go through scripts or chat.

## 4. Deploy

Every push to `staging/gc3d` deploys. To deploy something, merge a pull request into `staging/gc3d`, or push a commit
that already passed CI.

The pipeline is Actions > **Deploy gc3d.cloud** (`.github/workflows/deploy.yml`):

| Job | What it does |
|---|---|
| CI | The same four jobs as every pull request. Nothing ships unless they pass. |
| Build and push image | `ghcr.io/bluebonnetplayguard-dot/vivid-engine-site:sha-<commit>` and `:gc3d-staging`, using the build cache |
| Deploy | Connects over SSH with a pinned host key and sends `deploy <commit> <image@digest> <user>`, with the run's GHCR token on stdin. On the server, `gc3d-deploy`: dumps the gc3d database → logs in to GHCR with a throwaway Docker config → pulls → checks out the commit's `infra/gc3d` → recreates `gc3d-app` → waits for the container health check and `https://gc3d.cloud/api/health` through Nginx → keeps the new release, or **rolls back automatically**. The temporary registry credentials are deleted every time. |
| Verify | `infra/gc3d/verify-deploy.sh gc3d.cloud` from GitHub's network: DNS, CAA, certificate (issuer, names, days left), TLS 1.1 refused, TLS 1.3 and HTTP/2 offered, http→https, www→apex, `/`→`/studio`, health, `/studio`, asset caching and gzip, security headers, noindex, probe blocking |
| Roll back | Runs only when a *release* check failed. DNS or certificate problems are reported but don't trigger a rollback. |

Database migrations run when the new app starts. They only add tables and columns, so an older image works on a newer
database. A rollback never needs a database restore.

## 5. Verification

From any computer with bash:

```bash
EXPECT_IP=162.243.169.89 EXPECT_NOINDEX=1 EXPECT_HOME=/studio bash infra/gc3d/verify-deploy.sh gc3d.cloud
```

From Windows:

```
curl -s https://gc3d.cloud/api/health                     → {"ok":true}
curl -sI https://gc3d.cloud/ | findstr /i location        → /studio
curl -sI http://gc3d.cloud/ | findstr /i location         → https://gc3d.cloud/
curl -sI https://www.gc3d.cloud/ | findstr /i location    → https://gc3d.cloud/
curl -sI https://gc3d.cloud/studio | findstr /i "strict-transport x-robots x-frame"
curl -s https://vividenginesolutions.com/api/health       → {"ok":true}   (live site unaffected)
```

TLS grade: https://www.ssllabs.com/ssltest/analyze.html?d=gc3d.cloud should be A or A+.

In a browser (desktop Chrome, iPhone, iPad):

1. `gc3d.cloud` opens `/studio` with the padlock showing.
2. Sign up with the email you gave gc3d-setup. That account gets the admin role.
3. Open the studio, select a wall, change the siding, Save, reload: the change is still there.
4. Render > Export downloads a PNG.
5. DevTools: the console shows no errors, and the Network tab shows `h2`, with `immutable` cache headers on `/assets`.

On the server (console, as root):

```bash
gc3d-deploy status                                  # current/previous release, container states, history
docker stats --no-stream                            # memory of every container, gc3d capped at 1 GB + 512 MB
cd /opt/vivid/infra && docker compose ps            # live site containers unchanged
tail /var/log/gc3d-error-watch.log /var/log/gc3d-backup.log
```

## 6. Logs and monitoring

| What | Where |
|---|---|
| gc3d app | `docker compose -p gc3d --env-file /var/lib/gc3d/gc3d.env -f /opt/gc3d/infra/gc3d/compose.yml logs -f --tail=200 gc3d-app` |
| gc3d Nginx | `/opt/vivid/infra/logs/nginx/gc3d-access.log`, `gc3d-error.log` (separate from the live site's logs; rotated daily, 14 kept) |
| Deploy history | `/var/lib/gc3d/releases/history.log`, and every run in GitHub Actions |
| Who called the deploy gate | `journalctl -t gc3d-ssh-gate` |
| Error monitoring | `/var/log/gc3d-error-watch.log`. Every 5 minutes it checks for 5+ app errors, 10+ responses with 5xx errors, an unhealthy gc3d-app, disk at 85% or more, or memory at 92% or more. Alerts go to `ALERT_WEBHOOK_URL` in `/var/lib/gc3d/gc3d.env` (Slack or Discord), at most once an hour per problem. |
| Uptime | DigitalOcean > Monitoring > Uptime > Create check: HTTPS, `https://gc3d.cloud/api/health`, regions US East + US West; alerts *Down* (2 min) and *SSL certificate expires* (< 14 days) to your email |

## 7. Settings (`/var/lib/gc3d/gc3d.env`)

gc3d-setup writes these. Add keys only by editing that file on the server, then apply them with:

```bash
docker compose -p gc3d --env-file /var/lib/gc3d/gc3d.env -f /opt/gc3d/infra/gc3d/compose.yml up -d --no-deps --force-recreate gc3d-app
```

| Variable | Value | Note |
|---|---|---|
| `DOMAIN`, `PUBLIC_ORIGIN` | `gc3d.cloud`, `https://gc3d.cloud` | |
| `POSTGRES_USER` / `POSTGRES_DB` / `POSTGRES_PASSWORD` | `gc3d` / `gc3d` / generated | its own database |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `PUBLIC_CLIENT_SECRET`, `HISTORY_ENCRYPTION_KEY` | generated | different from the live site's, so logins don't cross over |
| `ADMIN_EMAILS`, `STAFF_NOTIFY_EMAIL` | your email | |
| `STUDIO3D_ENABLED` | `true` | |
| `BILLING_MONITOR_JOBS` | `off` | the live site already runs the billing jobs |
| `APP_IMAGE` | written by each deploy | |
| `ANTHROPIC_API_KEY` | you add it | the full AI assistant. Without it, the studio's built-in command parser still works. |
| `SMTP_*`, `MAIL_FROM` | you add them | needed for sign-up codes. You can reuse the live site's SMTP account, with `MAIL_FROM=Vivid Engine Solutions <info@vividenginesolutions.com>`. |
| `ALERT_WEBHOOK_URL` | optional | where error-watch alerts go |

## 8. Rollback and recovery

| Situation | What to do |
|---|---|
| New release fails its health check | Nothing to do. gc3d-deploy has already restored the previous release, and the run is marked red. |
| New release breaks a page | The verify job fails, and the rollback job runs automatically. |
| Go back to the previous release by hand | Console: `gc3d-deploy rollback x`. Or Actions > Deploy gc3d.cloud > Run workflow > `rollback`, once deploy.yml is on the default branch. |
| Restore the gc3d database | `gunzip -c /var/lib/gc3d/backups/gc3d-<time>.sql.gz \| docker compose -p gc3d --env-file /var/lib/gc3d/gc3d.env -f /opt/gc3d/infra/gc3d/compose.yml exec -T gc3d-db psql -U gc3d -d gc3d` (into an empty database) |
| Take gc3d off the server | `bash /root/gc3d-setup.sh uninstall`. The live site keeps running; gc3d's data is kept. |
| Something looks wrong with the live site | `cd /opt/vivid/infra && docker compose logs --tail=80 web`. To remove the gc3d block right away, run `uninstall` as above. |

## 9. Email on @gc3d.cloud later (optional)

When you add a mail service, replace the SPF and DMARC records from step 1 with the provider's:

- **Google Workspace**: MX `smtp.google.com` (priority 1), `v=spf1 include:_spf.google.com -all`, and DKIM from Admin
  console > Gmail > Authenticate email.
- **Resend or Postmark**: the records shown on their domain page.

Then change DMARC to `p=none` with a `rua=` report address for 2–4 weeks before going back to `p=reject`.

## 10. Troubleshooting

| Message | Fix |
|---|---|
| `gc3d.cloud resolves to '…', not this server` | DNS isn't live yet, or the old GitHub Pages records are still there (step 1). Wait 10–30 minutes and re-run. |
| `certificate request failed` | Same cause as above. Let's Encrypt allows 5 failures an hour, so wait an hour before trying again. |
| `docker-compose.override.yml already exists with other content` | Someone added an override earlier. Add the single `web` volume line from `gc3d-setup.sh` to it by hand and re-run. |
| Deploy job: `Permission denied (publickey)` | `GC3D_SSH_KEY` is incomplete. Run `bash /root/gc3d-setup.sh ci-key` and paste the new key. |
| Deploy job: `Host key verification failed` | Replace `GC3D_KNOWN_HOSTS` with the lines gc3d-setup prints. |
| Deploy job: `refused: …` | The workflow sent a request the gate doesn't allow. Check that deploy.yml matches `infra/gc3d/gc3d-ssh-gate.sh`. |
| Deploy job: `ghcr.io login failed` / `pull failed` | GitHub > the vivid-engine-site package > Package settings > Manage Actions access: give this repository Read access. |
| gc3d.cloud `502` | gc3d-app isn't running or healthy. Check `gc3d-deploy status` and the gc3d app logs (section 6). |
