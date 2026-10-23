# Upload to your DigitalOcean Droplet

You need: an Ubuntu 24.04 Droplet (2 vCPU / 4 GB is plenty) and your domain's DNS pointing at it.

## Before you start: point DNS at the Droplet

In your DNS settings, set **A records** for `vividenginesolutions.com` and `www` to the Droplet's IP address.
Keep your email (MX) records (see `docs/DNS.md`). The installer checks this and stops safely if DNS isn't ready yet.

## Three commands

From the folder on your PC that has `vivid-engine-droplet.tar.gz` (PowerShell or Terminal):

```bash
scp vivid-engine-droplet.tar.gz root@YOUR_DROPLET_IP:/root/
```

Then log in to the Droplet:

```bash
ssh root@YOUR_DROPLET_IP
```

And on the Droplet:

```bash
tar -xzf vivid-engine-droplet.tar.gz && cd vivid-engine && bash install.sh
```

The installer asks three questions:
- Your domain
- The admin email
- The email for certificate notices

Then it sets everything up:
- Generates every password and secret
- Installs Docker, the firewall, fail2ban and automatic security updates
- Gets the HTTPS certificate
- Builds the site and starts it (first run takes about 5 to 10 minutes)
- Schedules nightly database backups

When it finishes, `https://vividenginesolutions.com` is live.

## After install

| Do this | How |
|---|---|
| Add your keys (email, Stripe, Claude, Google, optional Twilio and research providers) | `nano /opt/vivid/infra/.env`, then `cd /opt/vivid/infra && docker compose up -d app` |
| Create your admin account | Sign up on the site with the admin email you gave the installer (needs SMTP set, to receive the code) |
| Import Base44 data | `docs/DEPLOY.md`, step 4 |
| Install an update later | Upload the new `.tar.gz` the same way and run `bash install.sh` again. Settings, data and imports are kept |
| Check it's running | `curl -s https://vividenginesolutions.com/api/health` should return `{"ok":true}` |

Full details, App Platform option and troubleshooting: `docs/DEPLOY.md`.
