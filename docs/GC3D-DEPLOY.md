# gc3d.cloud: deployment runbook

The GC platform (website, API and the GC 3D Design Studio) runs at **https://gc3d.cloud** on its own DigitalOcean
Droplet. It is completely separate from vividenginesolutions.com, which is a different Droplet with a different
database. gc3d.cloud is a staging site: it sends `X-Robots-Tag: noindex, nofollow`, so it never competes with the
main site in search. `/` opens the studio.

```
 GitHub                                                     DigitalOcean (Droplet gc3d-1, Ubuntu 24.04)
 ──────                                                     ───────────────────────────────────────────
 push to staging/gc3d                                       Cloud Firewall: 22, 80, 443 in; Postgres never exposed
   └─ deploy.yml                                            /opt/vivid  (git checkout, read-only deploy key)
        ├─ CI: gitleaks, site lint+build, API tests,          infra/docker-compose.yml
        │      Docker build + smoke test                        web       nginx 1.27: TLS, HTTP/2, headers, rate limits
        ├─ build image ─► ghcr.io/…/vivid-engine-site:sha-…     app       ghcr image (site + API, port 8080 inside)
        ├─ deploy (SSH as "deploy") ─► remote-deploy.sh         postgres  16, data on a Docker volume
        │      backup ─► switch ─► health check ─► keep          certbot   renews Let's Encrypt every 12 h
        │                               └─ fail ─► roll back   cron: 03:15 DB backup, every 5 min error-watch.sh
        └─ verify from the internet (verify-deploy.sh)
               └─ release check fails ─► rollback job
```

| File | What it is |
|---|---|
| `.github/workflows/deploy.yml` | The pipeline: CI, image build, deploy, verify, rollback |
| `.github/workflows/ci.yml` | The checks every pull request runs; deploy.yml reuses them |
| `infra/gc3d/cloud-init.yaml` | First-boot setup of the Droplet (users, SSH hardening, keys, `gc3d-bootstrap`) |
| `infra/gc3d/provision.sh` | Optional: creates Droplet, firewall, DNS and monitoring with `doctl` |
| `infra/gc3d/github-setup.sh` | Optional: GitHub environment, variables, deploy branch, branch protection with `gh` |
| `infra/scripts/remote-deploy.sh` | Runs on the server: deploy / rollback / status |
| `infra/scripts/verify-deploy.sh` | External checks: DNS, TLS, health, redirects, headers, pages |
| `infra/scripts/error-watch.sh` | Error monitoring (cron, every 5 minutes) |
| `infra/docker-compose.yml`, `infra/nginx/templates/default.conf.template` | Shared with vividenginesolutions.com; gc3d turns on `ROBOTS_TAG` and `HOME_REDIRECT` |

Order matters: Droplet → DNS → nameservers → deploy key → bootstrap → GitHub secrets → first deploy.

---

## 1. Droplet and firewall

**Control panel** (Create > Droplets):

| Setting | Value |
|---|---|
| Region | New York 3 (`nyc3`), or the closest region offered to Texas |
| Image | Ubuntu 24.04 (LTS) x64 |
| Size | Basic, Regular SSD, **2 vCPU / 4 GB / 80 GB** (`s-2vcpu-4gb`, $24/mo). 2 GB is not enough for the API, Postgres and Nginx together. |
| Authentication | SSH key (your existing DigitalOcean key) |
| Advanced options | **Enable IPv6**; **Add initialization scripts** = the whole of `infra/gc3d/cloud-init.yaml` |
| Monitoring | on (free agent: CPU, memory, disk graphs and alerts) |
| Backups | optional weekly, +20% ($4.80/mo). The nightly database dump runs either way. |
| Hostname | `gc3d-1` |
| Tags | `gc3d` |

**Networking > Firewalls > Create firewall** `gc3d-web`:

| Direction | Type | Protocol | Ports | Sources / destinations |
|---|---|---|---|---|
| Inbound | SSH | TCP | 22 | All IPv4, All IPv6 |
| Inbound | HTTP | TCP | 80 | All IPv4, All IPv6 |
| Inbound | HTTPS | TCP | 443 | All IPv4, All IPv6 |
| Inbound | ICMP | ICMP | | All IPv4, All IPv6 |
| Outbound | All TCP, All UDP, ICMP | | all | All IPv4, All IPv6 |

Apply it to the tag `gc3d`. SSH stays open to the internet because GitHub Actions connects from changing
addresses. It is protected by key-only login (passwords are off), `AllowUsers root deploy`, a rate limit
(`ufw limit`) and fail2ban.

**Same thing with doctl** (from a PC, after `doctl auth init`): `bash infra/gc3d/provision.sh you@example.com` does
steps 1, 2 and the monitoring in section 9.

Wait about 3 minutes after creation. When the Droplet console says
`gc3d first boot finished … Next step: gc3d-bootstrap <your-email>`, first boot is complete.

## 2. DNS records (DigitalOcean: Networking > Domains > Add domain `gc3d.cloud`)

| Type | Hostname | Value | TTL | Why |
|---|---|---|---|---|
| A | `@` | Droplet IPv4 | 300 | the site |
| AAAA | `@` | Droplet IPv6 | 300 | the site over IPv6 |
| CNAME | `www` | `gc3d.cloud.` | 300 | www (Nginx redirects it to the bare domain) |
| CAA | `@` | `0 issue "letsencrypt.org"` | 3600 | only Let's Encrypt may issue certificates |
| CAA | `@` | `0 issuewild ";"` | 3600 | no wildcard certificates at all |
| CAA | `@` | `0 iodef "mailto:<your email>"` | 3600 | where CAs report refused requests |
| TXT | `@` | `v=spf1 -all` | 3600 | no server may send mail as @gc3d.cloud (until email is set up, section 11) |
| TXT | `_dmarc` | `v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s` | 3600 | receivers reject spoofed @gc3d.cloud mail |
| MX | `@` | `.` priority 0 | 3600 | "null MX": the domain receives no mail. Skip it if the panel rejects `.`; the SPF and DMARC records already stop spoofing. |

DigitalOcean creates the three NS records itself. After a week without problems, raise the TTLs of A, AAAA and
CNAME from 300 to 3600. The short TTL only matters while addresses might still change.

**Verification TXT records** are added only when a service asks for one, exactly as that service shows it, e.g.
Google Search Console `google-site-verification=…` at `@`, or GitHub's `_github-challenge-<org>` for a verified
domain. Search Console is pointless while the site is `noindex`.

## 3. Nameservers at Porkbun

1. porkbun.com > Account > **Domain Management** > `gc3d.cloud` > **Details**.
2. If **DNSSEC** is on for the domain, turn it off first. DigitalOcean DNS doesn't sign zones, and a leftover DS
   record makes the domain fail to resolve.
3. **Authoritative Nameservers** > Edit > delete the four `*.porkbun.com` entries and enter:
   ```
   ns1.digitalocean.com
   ns2.digitalocean.com
   ns3.digitalocean.com
   ```
   Save. Porkbun's own DNS records (parking page, URL forwarding) stop applying from then on.
4. Check (minutes; up to 48 h in rare cases):
   ```bash
   dig +short NS gc3d.cloud                 # ns1/ns2/ns3.digitalocean.com.
   dig +short A gc3d.cloud @1.1.1.1         # the Droplet IPv4
   dig +short AAAA gc3d.cloud @8.8.8.8      # the Droplet IPv6
   dig +short www.gc3d.cloud @1.1.1.1       # gc3d.cloud. then the IPv4
   dig +short CAA gc3d.cloud                # 0 issue "letsencrypt.org" …
   ```
   On Windows without dig: `nslookup -type=NS gc3d.cloud 1.1.1.1`.

## 4. GitHub deploy key (read-only)

The server fetches code with its own key, which can only read this one repository.

1. Droplet console (DigitalOcean > Droplets > gc3d-1 > **Console**): `cat /home/deploy/.ssh/github_deploy_key.pub`
2. GitHub > repository **Settings > Deploy keys > Add deploy key**. Title `gc3d-1 (read-only)`, paste the key,
   **leave "Allow write access" unchecked** > Add key.

## 5. Bootstrap the server (once)

In the Droplet console, as root:

```bash
gc3d-bootstrap you@example.com            # your email: admin account + Let's Encrypt notices
```

It checks the deploy key and DNS first, and stops with a clear message if either isn't ready. Then:

1. clones `staging/gc3d` to `/opt/vivid`
2. writes `/opt/vivid/infra/.env` with freshly generated database password, JWT secrets and encryption key (mode 600)
3. runs `infra/scripts/setup-droplet.sh` with `SKIP_STACK=1`:
   - apt upgrade and unattended security upgrades
   - ufw (22 limited, 80, 443) and fail2ban (SSH + Nginx jails)
   - Docker and 2 GB swap
   - **the Let's Encrypt certificate** for `gc3d.cloud` + `www.gc3d.cloud` (certbot standalone on port 80)
   - the nightly backup cron (03:15)
4. installs error-watch (cron every 5 min) and log rotation (14 days)
5. prints the values for step 6, **including the GitHub Actions private key once**, and deletes that key from the
   server when you press Enter

The certificate renews automatically. The `certbot` container runs `certbot renew --webroot` every 12 hours, and
`web` reloads Nginx every 6 hours, so a renewed certificate is used without a restart. Commands to check or
renew by hand:

```bash
cd /opt/vivid/infra
docker compose run --rm --entrypoint certbot certbot certificates
docker compose run --rm --entrypoint certbot certbot renew --dry-run --webroot -w /var/www/acme
docker compose exec web nginx -s reload
```

## 6. GitHub settings

**Environment** (Settings > Environments > New environment `gc3d-staging`):

| Kind | Name | Value |
|---|---|---|
| Deployment branches | selected branches | `staging/gc3d`, `main` |
| Secret | `GC3D_SSH_KEY` | the private key printed by gc3d-bootstrap (`-----BEGIN OPENSSH PRIVATE KEY-----` … `END …-----`, all lines) |
| Secret | `GC3D_KNOWN_HOSTS` | the two `<ip> ssh-ed25519 …` / `<ip> ecdsa-sha2-nistp256 …` lines it printed |
| Variable | `GC3D_HOST` | Droplet IPv4 |
| Variable | `GC3D_IPV4` | Droplet IPv4 (checked against DNS after each deploy) |
| Variable | `GC3D_IPV6` | Droplet IPv6 |
| Variable | `GC3D_SSH_USER` | optional, default `deploy` |

**Repository variable** (Settings > Secrets and variables > Actions > Variables): `GC3D_DEPLOY_BRANCH` =
`staging/gc3d`. Change it to `main` once the studio PRs are merged, so main deploys instead.

**Branch protection** (Settings > Branches):

| Branch | Rules |
|---|---|
| `main` | Pull request required. Required checks: *Secret scan (gitleaks)*, *Website (lint, names, build)*, *API (build, tests)*, *Docker image, smoke test and repo checks*. Conversations resolved. No force-push, no deletion. |
| `staging/gc3d` | Same four required checks (only commits that passed CI can be pushed). No force-push, no deletion. |

`bash infra/gc3d/github-setup.sh <ipv4> <ipv6>` does all of the above except the two secrets, with `gh` as an
admin. Secrets are only ever typed by you into GitHub.

**Packages:** the first run creates `ghcr.io/bluebonnetplayguard-dot/vivid-engine-site`. It stays private and is
linked to this repository, so the workflow's own token can push and pull it. No extra token is needed.

## 7. Deploy

```bash
# first deploy: the studio stack plus this pipeline (the branch must contain .github/workflows/deploy.yml)
git push origin infra/gc3d-deploy:staging/gc3d
# later deploys: push or merge into staging/gc3d
```

The pipeline (Actions > **Deploy gc3d.cloud**) runs these steps:

1. **CI**: the same four jobs as every PR. Nothing is deployed unless they all pass.
2. **Build and push image**: `ghcr.io/…/vivid-engine-site:sha-<commit>` and `:gc3d-staging`, using a Buildx layer cache.
3. **Deploy**: SSH as `deploy` with the pinned host key, over one multiplexed connection. Then:
   - log the server in to GHCR with this run's short-lived token
   - run `remote-deploy.sh deploy <commit> <image@digest>`: database dump, `git checkout` of the commit's configs,
     pull, replace the app container
   - wait for Docker's health check, then `https://gc3d.cloud/api/health` through Nginx
   - if a check fails: **automatic rollback** to the previous release (image + configs), and the job fails
   - finally, log the server out of GHCR
4. **Verify**: `verify-deploy.sh gc3d.cloud` from GitHub's network: DNS, certificate, TLS versions, HTTP/2,
   redirects, health, `/studio`, asset caching and gzip, security headers, `noindex`, probe blocking.
5. **Roll back**: runs only if a *release* check in step 4 failed. DNS or certificate problems are reported but
   don't trigger a rollback, because the old release would have the same problem.

The first deploy also starts Postgres, Nginx and certbot. Database migrations run automatically when the app starts.

## 8. Verification

**From any computer:**

```bash
bash infra/scripts/verify-deploy.sh gc3d.cloud                               # all checks; exit 0 = pass
EXPECT_IP=<ipv4> EXPECT_NOINDEX=1 EXPECT_HOME=/studio bash infra/scripts/verify-deploy.sh gc3d.cloud

curl -fsS https://gc3d.cloud/api/health                                      # {"ok":true}
curl -sI http://gc3d.cloud/ | grep -i location                               # https://gc3d.cloud/
curl -sI https://www.gc3d.cloud/ | grep -i location                          # https://gc3d.cloud/
curl -sI https://gc3d.cloud/ | grep -i location                              # https://gc3d.cloud/studio
curl -sI https://gc3d.cloud/studio | grep -iE "strict-transport|x-robots|x-frame|x-content-type"
curl -s -o /dev/null -w '%{http_version} %{time_total}s\n' https://gc3d.cloud/api/health   # 2 and well under 1 s
echo | openssl s_client -connect gc3d.cloud:443 -servername gc3d.cloud 2>/dev/null | openssl x509 -noout -issuer -dates -ext subjectAltName
```

**TLS grade:** https://www.ssllabs.com/ssltest/analyze.html?d=gc3d.cloud should give A or A+.

**Browser** (desktop Chrome, an iPhone and an iPad or Android tablet):

| Check | Expected |
|---|---|
| Open `gc3d.cloud` | goes to `https://gc3d.cloud/studio`, padlock shown, no mixed-content warnings in DevTools |
| Sign up with your admin email, verify, sign in | portal loads; Studio opens with the sample house |
| Rotate, select a wall, change siding, Save, reload | change is kept |
| AI assistant: "Change the roof to black metal" | works without an Anthropic key via the quick parser; full AI once `ANTHROPIC_API_KEY` is set |
| Render > Export | 2400 × 1500 PNG downloads |
| DevTools > Network | `/assets/*.js` served `200`, `cache-control: …immutable`, `content-encoding: gzip`, protocol `h2` |
| DevTools > Console | no errors |

**On the server** (`ssh deploy@<ip>` or the Droplet console):

```bash
cd /opt/vivid/infra
bash scripts/remote-deploy.sh status          # current and previous release, container states
docker compose ps                             # app healthy; web, postgres, certbot up
cat /opt/vivid/releases/history.log
sudo ufw status verbose; sudo fail2ban-client status
```

## 9. Logs and monitoring

| What | Where / command |
|---|---|
| App (API + server-rendered pages) | `docker compose logs -f --tail=200 app` (Docker json logs, 3 × 20 MB per container) |
| Nginx access / errors | `/opt/vivid/infra/logs/nginx/vivid-access.log`, `vivid-error.log` (rotated daily, 14 kept) |
| Deploy history | `/opt/vivid/releases/history.log`; every run in GitHub Actions |
| Backups | `/var/log/vivid-backup.log`; dumps in `/opt/vivid/backups` (14 days), plus Spaces if `SPACES_*` is set |
| Error monitoring | `/var/log/vivid-error-watch.log`. Every 5 minutes it checks for: ≥ 5 app errors, ≥ 10 5xx responses, an unhealthy container, disk ≥ 85 %, memory ≥ 92 %. Alerts go to `ALERT_WEBHOOK_URL` in `.env` (Slack or Discord incoming webhook), at most once an hour per problem. |
| Uptime | DigitalOcean > Monitoring > Uptime: check `gc3d-health` on `https://gc3d.cloud/api/health` from 3 regions; email alerts for down (2 min), certificate expiring (< 14 days) and slow (> 2 s) |
| Resources | DigitalOcean > Monitoring > Alerts: CPU > 85 %, memory > 90 %, disk > 85 % for 10 min; email |

`provision.sh` creates the uptime check and alerts. In the control panel they are under **Monitoring > Uptime >
Create uptime check** (type HTTPS, the URL above, regions US East / US West / EU West) and **Monitoring > Create
resource alert**.

## 10. Rollback and recovery

| Situation | What to do |
|---|---|
| New release fails its health check | Nothing: `remote-deploy.sh` already put the previous release back. The run is red and the log shows why. |
| New release passes health but breaks a page | The verify job fails and the rollback job runs automatically. |
| You want the previous release back | Actions > Deploy gc3d.cloud > Run workflow > `rollback` (once deploy.yml is on the default branch), or on the server: `bash /opt/vivid/infra/scripts/remote-deploy.sh rollback` |
| Go back to any older commit | `git push origin <old-commit>:staging/gc3d --force-with-lease` is blocked by protection on purpose. Instead revert on a branch, open a PR into `staging/gc3d` and merge it. |
| Database must go back | `cd /opt/vivid/infra && bash scripts/restore.sh /opt/vivid/backups/vivid-YYYYMMDD-HHMMSS.sql.gz` (overwrites everything since that dump). A dump is taken before every deploy. |
| Server lost | New Droplet (steps 1, 4, 5), point the A/AAAA records at it, restore the latest dump from Spaces. |

Migrations are additive (new tables and columns), so an older image runs fine on a newer database. That's why an
image rollback never needs a database restore.

## 11. Environment variables (`/opt/vivid/infra/.env` on the Droplet)

gc3d-bootstrap writes these. You only ever add keys by editing the file on the server
(`nano /opt/vivid/infra/.env`, then `cd /opt/vivid/infra && docker compose up -d --no-deps --no-build app`).
Keys never go into GitHub, chat or a commit.

| Variable | gc3d value | Notes |
|---|---|---|
| `DOMAIN` | `gc3d.cloud` | Nginx server name, certificate |
| `PUBLIC_ORIGIN` | `https://gc3d.cloud` | links in emails, canonical URLs |
| `LETSENCRYPT_EMAIL`, `ADMIN_EMAILS`, `STAFF_NOTIFY_EMAIL` | your email | admin role on sign-up |
| `POSTGRES_USER` / `POSTGRES_DB` / `POSTGRES_PASSWORD` | `gc3d` / `gc3d` / generated | |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `PUBLIC_CLIENT_SECRET` | generated (64 hex) | |
| `HISTORY_ENCRYPTION_KEY` | generated (base64, 32 bytes) | |
| `STUDIO3D_ENABLED` | `true` | the studio is off by default in production builds |
| `ROBOTS_TAG` | `noindex, nofollow` | header on every response |
| `HOME_REDIRECT` | `/studio` | where `/` goes |
| `APP_IMAGE` | written by each deploy | the image running now |
| `ANTHROPIC_API_KEY` | you add | full AI assistant; without it the studio's quick parser still works |
| `SMTP_*`, `MAIL_FROM` | you add | needed for sign-up codes. Without SMTP, sign-up can't finish. You can reuse the vividenginesolutions.com sender (`MAIL_FROM=Vivid Engine Solutions <info@vividenginesolutions.com>`), which needs no DNS change here. |
| `ALERT_WEBHOOK_URL` | you add | Slack or Discord webhook for error-watch alerts |
| `SPACES_*` | you add | off-site copies of the nightly dumps |

## 12. Email on @gc3d.cloud later (optional)

When you add a mail service, **replace** the lock-down records from step 2:

| Provider | Records |
|---|---|
| Google Workspace (mailboxes) | MX `@` → `smtp.google.com` priority 1 (delete the null MX); TXT `@` → `v=spf1 include:_spf.google.com -all`; DKIM TXT `google._domainkey` from Admin console > Gmail > Authenticate email |
| Resend (app email only) | the MX/TXT records `send.gc3d.cloud` and `resend._domainkey` shown on its Domains page; SPF on `send`, not `@` |
| Postmark (app email only) | DKIM TXT `<id>pm._domainkey` and Return-Path CNAME `pm-bounces` → `pm.mtasv.net`, from its Sender Signatures page |

Then move DMARC to monitoring first, `v=DMARC1; p=none; rua=mailto:dmarc@gc3d.cloud; fo=1`. After 2–4 weeks of
clean reports, set `p=quarantine`, then `p=reject`.

## 13. Costs

| Item | Monthly |
|---|---|
| Droplet s-2vcpu-4gb | $24 |
| Weekly Droplet backups (optional) | $4.80 |
| Spaces for off-site dumps (optional, shared with vividenginesolutions.com) | $5 |
| DNS, firewall, monitoring, uptime checks (first checks free), Let's Encrypt, GHCR (private, small) | $0 |
| gc3d.cloud renewal at Porkbun | yearly, per Porkbun's price |

## 14. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| gc3d-bootstrap: "GitHub refused the deploy key" | Step 4 not done, or the key was added to a different repo |
| gc3d-bootstrap: "resolves to …, not this Droplet" | Nameservers or the A record aren't live yet (step 3). Check with `dig @1.1.1.1` and run it again. |
| certbot: "too many failed authorizations" | Let's Encrypt limit (5 failures per hour). Wait an hour; make sure port 80 reaches the Droplet. |
| Deploy job: "Permission denied (publickey)" | `GC3D_SSH_KEY` is incomplete (copy BEGIN through END). Make a new one: `gc3d-new-ci-key` as root on the Droplet. |
| Deploy job: "Host key verification failed" | Droplet rebuilt or IP changed: replace `GC3D_KNOWN_HOSTS` with the lines `gc3d-bootstrap` prints |
| Deploy job: "denied" pulling from ghcr.io | Package > Package settings > Manage Actions access: give this repository Read |
| `/api/health` 502 | App down: `docker compose logs --tail=100 app`. Missing `.env` values are named in the log. |
| Sign-up code email never arrives | `SMTP_*` not set (section 11) |
