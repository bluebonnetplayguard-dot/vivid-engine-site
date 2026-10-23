# Vivid Video Studio

A browser video editor at **/video**, with features similar to Filmora, Kapwing, Canva Pro, Lumen5, Renderforest and Magisto.
It is our own code: no other company's code, templates, names or branding are copied.

| Page | What it is |
|---|---|
| `/video` | Home: start a video (blank or from a template), your saved videos, feature overview |
| `/video/edit/:id` | The editor (signed in, noindex) |
| `/video/pricing` | Plans |
| `/video/account` | Plan, usage, billing, Business team seats (signed in, noindex) |

## What it does

- **Timeline editor:** multiple video, text and audio tracks; drag to move, trim either edge, split (S), duplicate, ripple delete, snapping, zoom, undo/redo, autosave.
- **Preview:** click a clip to select it; drag to move, corner handle to resize.
- **Text and shapes:** 8 text styles, 15 fonts, outlines, boxes, glow, and 11 in/out animations. Shapes, gradient backgrounds and lower-third bars.
- **Transitions:** 13 (crossfade, dip to black/white, slides, wipe, circle, zoom, blur, spin, whip pan, glitch).
- **Filters and effects:** 13 filters and color grades, brightness/contrast/saturation/blur, slow zoom (Ken Burns), blurred background fill, vignette, drop shadow, film grain, glitch, RGB split, camera shake, green screen.
- **Keyframes:** position, size, rotation and opacity.
- **Audio:** volume, fades, speed, music auto-ducking under voice, and silence removal for talking clips.
- **Templates:** 12, using the selected brand kit's colors and fonts. Placeholders show where the customer's photos and videos go.
- **AI captions:** speech to timed captions (OpenAI `whisper-1`), in 4 styles including word highlight.
- **AI voiceover:** 11 voices (OpenAI `gpt-4o-mini-tts`).
- **Script to video:** paste an article or idea. Claude Haiku (or OpenAI if Claude is unavailable) writes the scenes, Pexels supplies footage, AI voiceover reads it, and captions are added.
- **Brand kits:** colors, fonts, and a logo that can go on every video. Shared across a Business team.
- **Export:** MP4 (H.264 + AAC) at 720p, 1080p or 4K, 30 or 60 fps.

## How it works (and why it is cheap to run)

Video never touches the server. Files are kept in the customer's browser (IndexedDB), the preview and export are drawn on
a canvas, and the MP4 is encoded with the browser's built-in hardware encoder (WebCodecs). The project saved to the
account holds only the edit decisions (JSON, up to ~450 KB), so a project opened on another device asks the customer to
relink their files. Browsers without WebCodecs fall back to recording the video in real time as WebM.

The only server costs are the AI features. Each one is metered in `video_usage` and capped per plan. A daily ceiling,
`VIDEO_DAILY_BUDGET_USD` (default $10), pauses AI for the rest of the UTC day if spend ever runs away.

| Piece | File |
|---|---|
| Plans and limits (single source of truth) | `backend/src/video/video-plans.ts` |
| Limits, projects, brand kits, exports, seats | `backend/src/video/video.service.ts` |
| Captions, voiceover, script-to-video, stock search and relay | `backend/src/video/video-ai.ts` |
| Stripe checkout, portal, webhook sync | `backend/src/video/video.billing.ts` |
| Endpoints under `/api/video/*` | `backend/src/video/video.controller.ts` |
| Database tables (new, additive) | `backend/src/migrations/003_video_studio.sql` |
| Editor engine (model, renderer, player, exporter, MP4 writer, audio, media, templates) | `site/src/video/engine/` |
| Editor screens | `site/src/video/editor/` |
| Pages | `site/src/pages/VideoStudio.jsx`, `VideoEditorPage.jsx`, `VideoPricing.jsx`, `VideoAccount.jsx` |

## Plans

| Plan | Price | Export | Length | Effects | Brand kits | AI per month |
|---|---|---|---|---|---|---|
| Free | $0 | 720p, watermark, 10/month | 3 min | Basic | none | 10 caption min, 2 drafts, 2,000 voice characters |
| Creator | $12 | 1080p, 60/month | 15 min | + Creator (all transitions, filters, text animations, speed, ducking, silence removal) | 1 | 90 min, 15 drafts, 30,000 characters |
| Pro | $29 | 1080p 60 fps, 200/month | 30 min | + Pro (green screen, keyframes, grades, glitch, grain) | 3 | 300 min, 50 drafts, 100,000 characters |
| Studio | $59 | 4K 60 fps, 1,000/month | 60 min | All | 10 | 900 min, 150 drafts, 300,000 characters |
| Business | $24/seat (2+) | 1080p 60 fps | 30 min | All | 10, shared | Pro allowance per seat, pooled |

Every feature carries a level (`basic` / `standard` / `pro`), shown with a lock badge above the customer's plan.
Before rendering, the browser asks `POST /api/video/exports`, which checks the resolution, frame rate, length and the
highest effect level used, counts the export, and says whether to draw the watermark.

Because rendering happens on the customer's computer, a technical user could bypass the watermark or effect checks in
their own browser. That costs us nothing. Everything that costs money (AI, stock relay) is enforced on the server.

**Worst-case AI cost per plan** (whisper $0.006/min, voiceover ~$0.015/min, draft ~$0.01):
- Creator: about $1.20
- Pro: about $3.80
- Studio: about $11.40

All are well under each plan's price.

To change a price or limit, edit `video-plans.ts` and redeploy.

## Setup (on the server)

1. **Keys** in `/opt/vivid/infra/.env`:
   - `OPENAI_API_KEY` (already set) turns on captions and voiceover.
   - `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` turns on script-to-video.
   - Optional: `PEXELS_API_KEY` (free at pexels.com/api) turns on stock footage. Pexels asks apps to credit photographers; the editor shows credits on each stock clip.
2. **Stripe:** nothing new. It uses the same webhook endpoint and events as AI Search (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`). The customer portal setting for quantity changes covers Business seats.
3. Restart the app after changing keys: `cd /opt/vivid/infra && docker compose up -d app`.

## Checks

- `backend/test/vivid seo.mjs` has 17 Video Studio checks: plans, sign-in, projects, plan limits on export, brand kits, the stock relay allow-list, checkout, and noindex on the editor.
- Tested in a browser before release:
  - An exported MP4 played at the right size and length, with audio.
  - Seeking was frame-accurate.
  - Templates, text editing, dragging, undo, transitions, autosave and auto-captions worked (captions against a stand-in API).
  - The phone layout stacked correctly.

## Roll back

```bash
cd /opt/vivid/infra && docker tag vivid-app:before-video vivid-app:latest && docker compose up -d app
```

The new `video_*` tables stay but are unused by the old version. No existing table or data is changed.
