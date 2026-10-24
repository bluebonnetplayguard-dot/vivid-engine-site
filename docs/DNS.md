# Moving DNS and hosting to DigitalOcean

Two different things are involved:

- **DNS hosting**: where your domain's records live. This moves to DigitalOcean (free).
- **Domain registration**: who you pay each year for the name itself (GoDaddy, Namecheap, Squarespace and so on). DigitalOcean is not a registrar, so registration stays where it is. You only change the nameservers there. If you also want to move registration, Cloudflare Registrar and Porkbun sell domains at cost. That is optional and separate from this move.

**Do the steps in this order.** Email breaks if the MX records are missing when the nameservers switch.

## 1. Before you change anything

1. Log in to your current DNS provider and **export or screenshot every record**: MX, TXT (SPF, DKIM, Google verification), CNAME and A.
2. Lower the TTL on the A and MX records to 300 seconds. Wait a day so the short TTL spreads.
3. Create the Droplet. Turn on **IPv6** when creating it (or later under Networking). Note its IPv4 and IPv6 addresses.

## 2. Add the domain in DigitalOcean

Control panel: **Networking > Domains > Add domain** > `vividenginesolutions.com`.

Recreate the records. Replace the values in angle brackets.

| Type | Hostname | Value | Notes |
|---|---|---|---|
| A | `@` | `<droplet IPv4>` | the website |
| AAAA | `@` | `<droplet IPv6>` | the website over IPv6 |
| A | `www` | `<droplet IPv4>` | Nginx redirects www to the bare domain |
| AAAA | `www` | `<droplet IPv6>` | |
| CAA | `@` | `0 issue "letsencrypt.org"` | only Let's Encrypt may issue certificates |
| MX | `@` | **copy from your current provider** | e.g. Google Workspace: `smtp.google.com`, priority 1 |
| TXT | `@` | `v=spf1 include:<your mail provider> ~all` | e.g. `include:_spf.google.com`. Add the SMTP service the API sends through (Postmark: `include:spf.mtasv.net`; Resend: follow its domain page) |
| TXT | `<selector>._domainkey` | **from your mail provider** | DKIM. Google: Admin console > Gmail > Authenticate email. Your SMTP sender gives its own DKIM record too |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:info@vividenginesolutions.com; fo=1` | start at `p=none`. After 2 to 4 weeks of clean reports, change to `p=quarantine` |
| TXT | `@` | `google-site-verification=...` | **copy existing**, keeps Search Console verified |

Any other records (other subdomains, Microsoft 365 records and so on): copy them as they are.

## 3. Switch the nameservers

At your **registrar**, set the nameservers to:

```
ns1.digitalocean.com
ns2.digitalocean.com
ns3.digitalocean.com
```

The change usually takes effect within an hour and can take up to 48. Check from any computer:

```bash
nslookup -type=NS vividenginesolutions.com
```

## 4. HTTPS

`infra/scripts/setup-droplet.sh` gets the first Let's Encrypt certificate once the A records point at the Droplet. The `certbot` container renews it automatically. Run the setup **after** step 3 has taken effect, or the certificate request fails.

## 5. CDN: not needed yet

Your visitors are local (Texas and Louisiana), and the Droplet is in one region. Nginx already gives the built assets one-year cache headers and gzip. A CDN would save little for a regional audience and adds another moving part. If you later want one, put Cloudflare's free proxy in front. That means hosting DNS at Cloudflare instead of DigitalOcean; the records above stay the same.

## 6. Domains you lease to clients

Each client domain gets the same treatment: add it under Networking > Domains, then point its A/AAAA records at the Droplet. If the site runs on this server, add a matching `server` block and certificate. Ask me and I'll script that per client.
