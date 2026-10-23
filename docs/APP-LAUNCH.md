# Vivid Engine as a web site and an app

One codebase serves three ways of using it:

| How people get it | What it is | Status |
|---|---|---|
| Website | vividenginesolutions.com in any browser | Live |
| Installed web app | "Install the app" button in the site footer (Android, Windows, Mac, ChromeOS) or Share → Add to Home Screen (iPhone/iPad) | Live after the next deploy |
| Google Play / Microsoft Store / App Store | A store package that opens the live site full-screen | Steps below |

Store apps load the live site, so **every website deploy updates the apps too**. You only rebuild a store package to change its icon, name or version.

---

## 1. Deploy the site changes (do this first)

Changed files:
- `site/src/components/InstallApp.jsx` – install button restyled to match the site
- `site/src/components/engine/EngineFooter.jsx` – shows the install button in the footer
- `site/public/manifest.json` – works on tablets/desktop (orientation `any`), adds the 1024px store icon, fixes the Domain Status shortcut
- `site/public/sw.js` – version bumped so installed copies pick up the update

Deploy the way you normally do (`deploy-to-droplet.ps1`, or see `DEPLOY-QUICK.md`).

**Check it worked:** open the site in Chrome on your PC → scroll to the footer → you should see **Install the app**. Or in Chrome: F12 → Application → Manifest shows no errors.

---

## 2. Google Play (Android) – easiest store

Uses a Trusted Web Activity: a real Android app that shows your site with no browser bar.

1. Go to **https://www.pwabuilder.com**, enter `https://vividenginesolutions.com`, click **Package for stores → Android**.
2. Settings:
   - Package ID: `com.vividenginesolutions.app`
   - App name: `Vivid Engine Solutions`, Launcher name: `Vivid Engine`
   - Signing key: **Create new** (download and keep the zip somewhere safe – you need it for every future update)
3. Download the package. Inside are an `.aab` file (upload to Play) and an `assetlinks.json`.
4. **Google Play Console** (one-time $25): create the app, upload the `.aab` to Internal testing first.
5. In Play Console → **Setup → App signing**, copy the **SHA-256 certificate fingerprint**.
6. Add a second entry to `site/public/.well-known/assetlinks.json` (keep the existing one):
   ```json
   {
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "com.vividenginesolutions.app",
       "sha256_cert_fingerprints": ["PASTE_PLAY_SIGNING_SHA256_HERE"]
     }
   }
   ```
   Deploy. Without this, the app shows a browser address bar at the top.
7. Store listing needs: privacy policy URL `https://vividenginesolutions.com/privacy`, account deletion URL `https://vividenginesolutions.com/delete-account` (both already exist), 2+ phone screenshots, the 512px icon (`site/public/icons/icon-512.png`).

## 3. Microsoft Store (Windows)

1. PWABuilder → **Package for stores → Windows**.
2. Needs a Microsoft Partner Center account (sign-up is free or a small one-time fee for individuals). Partner Center gives you the Package ID / Publisher values to paste into PWABuilder.
3. Upload the `.msixbundle`. Tile and splash images: use `site/public/windows-assets/run-assets.cmd`.

## 4. Apple App Store (iPhone/iPad)

Harder: needs a **Mac with Xcode** and an **Apple Developer account ($99/year)**.

1. PWABuilder → **Package for stores → iOS**, Bundle ID `com.vividenginesolutions.app`.
2. Open the downloaded project in Xcode on a Mac, set your Team, Archive, upload.
3. Add your Team ID + bundle ID to `site/public/.well-known/apple-app-site-association` (add to the `appIDs` lists, keep the existing entries).

Heads-up: Apple sometimes rejects apps that are "just a website." Your client portal, AI Search, Video Studio and account features help. Mention them in the review notes.

Until then, iPhone users can install from Safari (Share → Add to Home Screen). The footer button shows them how.

---

## About the existing app-link files

`apple-app-site-association` and `.well-known/assetlinks.json` still list the old Base44 app (`com.base6a9620cbd28f8dc991297e69.app`). They were left untouched in case that Base44 app is still installed on anyone's phone. Once your new store app is live and the Base44 app is retired, delete those Base44 entries.
