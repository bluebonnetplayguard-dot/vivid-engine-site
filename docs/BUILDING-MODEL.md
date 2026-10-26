# Structured building model (`gc-building/1`)

The one source of truth for a building's geometry. The 3D Design Studio edits it, the takeoff and estimating
engines read it, the AI command interpreter changes it only through validated commands, and the blueprint
pipeline produces it. Meshes and GLB files are always generated from it, never the other way round.

| Where | What |
|---|---|
| `backend/src/building-model/schema.ts` | zod schema for every element + `buildingModelJsonSchema()` (JSON Schema 2020-12) |
| `backend/src/building-model/model.ts` | `BuildingModel` class: parse, typed lookups, relationships, provenance |
| `backend/src/building-model/validate.ts` | Semantic rules (same as the studio's): opening fit, references, verified-size rules, outline warnings |
| `site/src/modules/gc-3d-design-studio/core/model.js` | The browser's copy of the same rules (plain JS, no build step) |
| `backend/test/building-model.test.mjs` | Parses the studio's own sample house and edited variants, so the two sides can't drift |

## Frame and units

Inches. `x` = east (building width), `y` = north (depth), `z` = up. The front of the building faces `-y`.
Exterior walls run counter-clockwise seen from above, so each exterior wall's `start` is on the left of a
person standing outside it; "move left" means toward `start`.

## Elements

| Element | Key fields | Relationships |
|---|---|---|
| **Floor** | `level`, `elevation`, `wallHeight` (floor to floor), `framing` | everything else names its `floor` |
| **Wall** | `start`, `end` (centerline), `height`, `thickness`, `exterior`, `face`, finishes and colors | `openingsInWall()`, `roomsOfWall()` |
| **Opening**: Window / Door | `wall`, `offset` (wall start → opening center), `width`, `height`, `sill`, `frame`, `door` | `wallOf()` |
| **Room** | `polygon` (centerlines), `type`, `floorFinish` | `wallsOfRoom()` (walls collinear with its edges), `componentsInRoom()` |
| **Roof** | gable: `axis`, `pitch` (x:12), `overhang`, `thickness`, `material` | sits on its `floor`'s exterior walls |
| **Component** | `kind` (slab, floor-deck, cabinet, countertop, patio, patio-post, patio-roof), `box {c, s, r?}` | optional `room`, `group` for added assemblies |
| **DrawingReference** | `sheet`, `page`, `title`, `region`, `note` | listed in `drawings`, cited from `dims.ref` |

## Dimensions and provenance

Every element may carry `dims`:

```json
{ "status": "verified", "source": "blueprint", "ref": { "sheet": "A-101", "page": 2, "title": "First floor plan" } }
```

- `status`: `conceptual` (shown with a "conceptual" badge) or `verified`.
- `source`: `sample` (built-in defaults), `blueprint` (read from a calibrated drawing), `ai-inferred`, `contractor`.
- **Rules (errors):** `ai-inferred` and `sample` sizes can never be `verified`; a `blueprint`-verified size must cite a drawing.
- `BuildingModel.provenance(id)` returns `{ verified, source, ref }` for any element; takeoffs use it to flag
  quantities built on unverified sizes.

## Validation

`validateBuilding(model)` returns findings with `severity`, `code`, `element`, `message`.

| Code | Severity | Meaning |
|---|---|---|
| `id.duplicate` | error | two elements share an id |
| `floor.missing` | error | element on a floor that doesn't exist |
| `wall.zero-length` | error | wall with no length |
| `opening.*` | error | outside its wall, within 4" of a corner or another opening, less than 6" header, door not at floor |
| `dims.verified-source`, `dims.verified-ref` | error | a "verified" size without a valid reason |
| `floor.no-exterior`, `floor.open-outline` | warning | exterior walls missing or not closed |
| `room.no-walls`, `component.room-missing` | warning | loose references |

Saving a design (`PUT /api/studio3d/designs/:id`) rejects schema errors and validation errors with
`code: MODEL_INVALID` and the list of issues. Warnings never block a save.

## API

- `GET /api/studio3d/schema`: the JSON Schema.
- `POST /api/studio3d/validate` `{ model }` → `{ ok, issues, findings }` without saving.

Design versions are stored by the existing `studio_designs` / `studio_design_versions` tables (migration 009).

## Geometry reader (`backend/src/geometry-reader/`)

`GeometryReader.read(model)` turns a parsed model into measured geometry. Every number is a `Measured`:
`{ value, unit, verified, source, from, ref? }`. A value is `verified` only when every element it was computed from
is verified; its `source` is the weakest of their sources (sample < ai-inferred < contractor < blueprint).

| Reading | Values |
|---|---|
| Wall | centerline length, outside length (corners included), height, thickness, gross area, opening area, net area, exterior-face area (siding), interior-face area (drywall/paint, at the floor's ceiling height), rooms on each side |
| Opening | width, height, sill, head, area, trim perimeter (doors: 2h + w; windows: 2(w + h)), world center |
| Room | area (three.js `ShapeUtils`), perimeter, width, depth, ceiling height, wall surface gross / openings / net (an opening counts for each room it opens into) |
| Roof (gable) | pitch, angle, pitch factor, run, rise, ridge height, ridge length, rafter length, plan area, surface area, eave and rake lengths, squares |
| Component | width, depth, height, top area, volume (slabs → concrete), front length (cabinet/counter runs) |
| Floor | elevation, wall height, ceiling height, footprint area and perimeter (closed exterior loop; bounding box with a warning if open), room area, exterior and interior wall length |
| Building | floors, footprint width/depth, total room area, height, window and door counts; `unverified[]`; `warnings[]` |

API: `GET /api/studio3d/designs/:id/geometry[?version=n]` and `POST /api/studio3d/geometry { model }`.
`backend/test/geometry-reader.test.mjs` checks the sample house against hand-worked numbers.
