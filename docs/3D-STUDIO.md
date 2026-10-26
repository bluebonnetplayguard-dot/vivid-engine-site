# GC 3D Design Studio (milestone 1)

An interactive 3D building model inside the app at **`/studio`** (signed-in; linked from the portal menu as "3D Design Studio").
Contractors rotate, walk through, select and edit a real building model, talk to it, save designs and versions, and
capture presentation images into the project.

## What works (tested in Chromium on desktop, iPhone 13 and iPad sizes)

`site/scripts/studio3d-e2e.mjs` runs the milestone-1 acceptance list end to end (32 checks):

| Acceptance step | How it works |
|---|---|
| Open the GC app → 3D Design Studio | Portal menu link → `/studio`, full-screen like the video editor |
| A building appears as an interactive model | Sample two-story house (40'×30', 9 ft / 8 ft ceilings, 6:12 gable) built from the structured model |
| Rotate with mouse or finger | Orbit (drag / one finger), zoom (wheel / pinch), pan (right-drag / two fingers) |
| Select an exterior wall → properties | Raycast selection; panel shows length, height, gross/net area, openings, finishes |
| Change the wall material → model updates | Material and color change instantly, no rebuild of geometry, undoable |
| "Change the roof to black metal" | Parsed into `UPDATE_MATERIAL` + `UPDATE_COLOR` commands, validated, applied |
| "Show me the front of the house" | `CHANGE_CAMERA front` with an animated camera move |
| Select a window → dimensions | Width, height, sill, head height, distance from each wall end, on-model labels |
| Save → reopen → changes remain | Saved to Postgres as a new design version; `/studio` reopens the latest project |
| Create a presentation image → saved to project | Viewport rendered at 1600×1000, stamped "conceptual, not for construction", stored with the project |

Also in this release: exterior / interior / dollhouse (roof off) / 2D floor plan per floor / walkthrough (drag to look,
WASD or on-screen arrows) / perspective ↔ orthographic / camera presets / day, sunset and evening lighting / layer
toggles / dimension overlay / two-point measure tool / undo-redo (Ctrl+Z, Ctrl+Shift+Z) / design variations
("brick version", "modern farmhouse version") as separate designs / version history with restore / covered-patio
addition / window and door move and resize with preview-then-approve / voice input where the browser supports it /
model JSON export / adaptive render quality on slower devices.

## How it is built

```
site/src/modules/gc-3d-design-studio/
  core/          pure JS, no three.js (unit-tested in site/tests/studio3d.test.mjs)
    model.js       structured building model (Building > Floor > Wall/Opening/Room/Roof/Component), measurements, checks
    sampleHouse.js the sample model (every size marked "conceptual")
    materials.js   material library by category and allowed surface, named colors
    commands.js    the validated command vocabulary, target resolution, pure apply functions, style presets
    quickparse.js  instant on-device parser for common requests
    units.js       ft-in formatting and parsing
  3d/            three.js (already a site dependency; no new packages)
    buildScene.js  model -> meshes (walls with real openings, frames, glass, doors, roof, rooms, cabinets)
    textures.js    procedural finish textures at real-world scale (no image downloads)
    Viewport.js    renderer, cameras, controls, selection, modes, lighting, labels, measure, capture
  state/         reducer (undo/redo, proposals) and the command runner
  ui/            StudioApp, panels, toolbar, styles (desktop three-panel layout; mobile bottom sheets)
backend/src/studio3d/
  studio3d.controller.ts / .service.ts   projects, designs, versions, images, interpret
  studio3d-ai.ts   Claude tool call -> commands (cost logged to the Billing Monitor)
  vocabulary.ts    server-side command schema (zod); a test fails if it drifts from the browser's list
backend/src/migrations/009_studio3d.sql  additive tables only
```

**The model is the source of truth.** Meshes are rebuilt from the structured model; dimensions, areas and later
takeoffs come from the model, never from the mesh. Every element carries `dims.status`: `conceptual` (sample, AI or
edited) or `verified` (checked against a named drawing sheet). The UI labels each one.

**AI is controlled.** Requests become commands from a fixed vocabulary (`SELECT_OBJECT`, `UPDATE_MATERIAL`,
`UPDATE_COLOR`, `MOVE_OBJECT`, `RESIZE_OBJECT`, `ADD_COMPONENT`, `REMOVE_COMPONENT`, `CHANGE_CAMERA`, `SET_VIEW`,
`TOGGLE_LAYER`, `SET_LIGHTING`, `GENERATE_RENDER`, `CREATE_DESIGN_VARIATION`, `SAVE_DESIGN`). The server checks their
shape; the browser checks them again against the building (a window must stay inside its wall, 4" from corners and
neighbours, with 6" for a header; materials only go on allowed surfaces). Nothing the AI writes is executed as code.
Camera and finish changes apply instantly; geometry changes are shown as a proposal the contractor applies or discards.

**One assistant.** The on-device parser handles common wording instantly and free. Anything else goes to
`POST /api/studio3d/interpret`, which uses Claude (the existing `ANTHROPIC_API_KEY`) with a forced tool call. Calls are
logged to the Billing Monitor (`workflow = studio3d`), respect its budgets, and are limited per user per day.

## Rendering engine (plain three.js r171)

| Feature | Where | Notes |
|---|---|---|
| PBR materials | `3d/materialFactory.js` | One factory per kind: surface finishes, glass, highlights, ground. Albedo, roughness and metalness come from the material library; coated metal and stone get a clearcoat layer at High quality. |
| Relief maps | `3d/textures.js` (`finishMaps`) | Normal and roughness maps are derived from the same procedural painting (Sobel on the height), so mortar joints, lap lines and seams catch the light. Nothing is downloaded. |
| Image-based lighting | `3d/environment.js` | A physically based sky (Preetham) is rendered for each lighting preset's sun position and PMREM-filtered. It works like an HDRI: it lights the materials and is the visible sky. If the GPU can't render it, the neutral studio environment is used instead. |
| Tone mapping | `Viewport` | ACES filmic, with sRGB output and exposure set per preset. |
| Soft shadows | `Viewport.fitShadows` | PCF soft shadows. The sun's shadow camera is fitted to the building, so the shadow map is spent on the house. The map is 4096 at High, 2048 at Balanced, and off at Fast. |
| Camera presets | `cameraPreset` | Front, back, left, right, top, corner (iso), **aerial**, dollhouse, street level, room, and rotate by N°. |
| First person | `walkStep`, `walkFloor`, `3d/walkCollision.js` | Walls block movement, doors wide enough for the body let you through, and you slide along walls. Long steps are split into sub-steps, so you can't tunnel through a wall. PageUp/PageDown or the ⤒⤓ buttons change floors. |
| Dollhouse | `updateCutaway` | The roof is off, and exterior walls facing the camera (with their windows and doors) are cut away live as you orbit. |
| Screenshots | `capture()` | Up to 4096 px. The frame is rendered 2× and scaled down (supersampling). Full shadows are always on for the image, even on devices that render without them. PNG or JPEG, with the "conceptual, not for construction" label. **Export** downloads a 2400 × 1500 PNG. |
| Performance | `Viewport` | Renders on demand, so an idle view draws no frames and uses no GPU or battery. Rendering pauses in background tabs. Materials and textures are shared, and geometry is rebuilt only when it changes. **Quality: auto** starts at Balanced (Fast on phones and low-power devices) and steps down by itself when frames get slow. The chosen setting is kept per browser. `viewport.stats()` reports fps, draw calls and triangles. |

## API (`/api/studio3d`, all signed-in, owner-only)

| Method | Path | |
|---|---|---|
| GET | `/status` | `{ enabled, ai }` |
| GET/POST | `/projects` | list; create `{ name, design: { title, data } }` |
| GET | `/projects/:id` | project, designs, image list |
| POST | `/projects/:id/designs` | new design (variation) |
| GET/PUT | `/designs/:id` | load; save `{ data, baseVersion, note }` → new version (409 if someone else saved first) |
| GET | `/designs/:id/versions[/:v]` | version history; one version's data |
| POST | `/projects/:id/images?label=&designId=&meta=` | raw `image/jpeg` or `image/png` body, ≤ 1 MB |
| GET | `/images/:id` | the image |
| POST | `/interpret` | `{ message, context, history }` → `{ reply, commands, dropped, engine }` |

## Configuration (no new secrets)

| Setting | Default | |
|---|---|---|
| `STUDIO3D_ENABLED` | on outside production, **off in production** | Set `true` on staging, then production, to switch the studio on |
| `STUDIO3D_MODEL` | `claude-sonnet-5-5` | Model for the AI interpreter |
| `STUDIO3D_AI_PER_DAY` | `200` | AI interpreter calls per user per day |
| `ANTHROPIC_API_KEY` | existing | Without it the studio works; only free-form AI requests are unavailable |

Migration `009_studio3d.sql` runs automatically at boot (additive; no existing table changes).
`main.ts` accepts raw `image/jpeg`/`image/png` bodies up to 1000 kB (under Nginx's 1 MB limit).

## Tests

```
cd site && node --test tests/studio3d.test.mjs              # model, measurements, commands, parser (10)
cd backend && npm run build && node --test test/studio3d.test.mjs   # server command vocabulary (3)
cd site && BASE=http://127.0.0.1:5173 EMAIL=... PASSWORD=... OUT=./studio-e2e node scripts/studio3d-e2e.mjs   # browser (32)
```

## Not done yet (next milestones)

- **Blueprint → 3D** (milestone 2): upload, scale calibration, Gemini extraction, read-vs-assumed table, correction UI.
- **AI photoreal rendering** (milestone 3): today "Render" captures the real 3D view. An OpenAI image-enhancement pass
  using that capture as the reference, clearly labeled as a concept image, is next. No OpenAI image code exists yet.
- **Wall editing / room resizing:** walls and rooms can't be moved yet; the assistant says so instead of faking it.
- **QCAD** (milestone 4): DXF export/import through a local companion; nothing in this release touches QCAD.
- **Storage:** images are stored in Postgres (≤ 1 MB each, ≤ 300 per project). Move them to DigitalOcean Spaces
  before heavy use.
- The free-form AI path (`/interpret`) is implemented and its output validation is tested, but it was **not run
  against the live Claude API** in development (no key in the test environment). Test it on staging with the key set.
