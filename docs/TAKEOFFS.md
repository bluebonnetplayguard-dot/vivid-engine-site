# Material takeoff engine

```
Studio design (gc-building/1) ──► BuildingModel.parse ──► GeometryReader.read ──► buildTakeoff ──► takeoffs table
   saved version                      (docs/BUILDING-MODEL.md)   measured geometry      line items      cached by input hash
```

Code: `backend/src/takeoff/`. Pure engine (`engine.ts`, `quantities.ts`, `materials.ts`) plus a job service and
controller. Every quantity keeps the provenance of the sizes it came from: `verified`, `source`
(`blueprint` | `ai-inferred` | `contractor` | `sample`, weakest wins) and `from` (element ids).

## Calculators (`quantities.ts`)

All return `{ value, verified, source, from }`.

| Function | Result |
|---|---|
| `calculateWallArea(wall, side)` | sq ft; `exterior` (outside face incl. corners), `interior` (inside face at ceiling height), `centerline` |
| `calculateFloorArea(room)` | sq ft |
| `calculateRoofArea(roof)` | sq ft of roof surface (both slopes, overhangs) |
| `calculateConcreteVolume(slab)` | cu yd |
| `calculateDrywallSheets(area, settings)` | sheets (4'×12' default) |
| `calculatePaintGallons(area, coats, coverage)` | gallons, rounded up |
| `calculateLumberCounts(wall, openings, settings, framedHeight)` | studs (layout − displaced + 2 king + 2 jack per opening + corners), plates (3 × length in stock pieces), 2-ply header LF (width + 3"), cripples, size (2x6 if ≥ 5½" thick), cut length |

## What a takeoff contains (`engine.ts`)

| Trade | Lines |
|---|---|
| Concrete | foundation slab, patio slab (cu yd, 5 % waste, ordered in ¼ yd) |
| Framing | studs by size and cut length, plates, header stock, cripples, subfloor sheets, patio posts and beam |
| Sheathing | wall OSB (wall faces + gable ends), roof OSB |
| Insulation | wall batts (inside face of exterior walls), attic blown (top-floor footprint) |
| Exterior | siding by chosen material (vinyl squares, brick count at 6.75/sq ft, stucco sq yd, ...), house wrap, exterior paint for paintable finishes |
| Roofing | by chosen material (shingle bundles, metal sq ft, tile squares), underlayment rolls, drip edge pieces, starter, ridge cap, patio cover |
| Openings | windows by size and frame, exterior and interior pre-hung doors by type and size, cased openings |
| Drywall | wall and ceiling sheets, finishing area |
| Paint | interior walls, ceilings, primer |
| Trim | exterior trim, interior casing (both sides of interior openings), baseboard (room perimeters less floor-level openings) |
| Flooring | by finish (tile 15 % waste, carpet in sq yd) |
| Cabinets / countertops | base, upper, island LF by material; countertop sq ft |

Changing a finish in the 3D Studio (brick vs siding, shingles vs metal) changes the lines, which is what the
estimating engine uses for alternates. Each line has `quantity` (net), `wastePct`, `order` (rounded up for
purchase), `basis` (how it was computed), `material` and provenance. `flags` warn about sample or unverified
sizes; `assumptions` say what isn't included yet (floor and roof framing members, footings and rebar, MEP).

Settings (`TakeoffSettings`, cleaned by `cleanSettings`): drywall sheet size, paint coats and coverage, stud
spacing, plate stock, sheathing sheet, wrap roll, underlayment, bundles per square, drip edge length, waste by trade.

## API (signed-in owner of the 3D Studio project)

| Method | Path | |
|---|---|---|
| POST | `/api/projects/:id/takeoffs` | `{ designId, version?, settings?, force? }` → `202` queued run, or `cached: true` when an identical takeoff exists |
| GET | `/api/projects/:id/takeoffs?designId=` | runs with status, summary and `stale` (design saved since) |
| GET | `/api/projects/:id/takeoffs/:takeoffId` | full result |
| GET | `/api/projects/:id/takeoffs/:takeoffId/events` | server-sent `progress` events (`queued → running → done/failed`), then `end` |

Background jobs run in the API process, one at a time, stored in `takeoffs` (migration `010_takeoffs.sql`).
A restart re-queues jobs left running more than 10 minutes. Five pending runs per user at most.
The events path is excluded from gzip in `main.ts`, and sends `X-Accel-Buffering: no`, so Nginx streams it.

## Tests

`backend/test/takeoff.test.mjs`: calculators and lumber math on hand-worked inputs, the full sample takeoff
(slab 30.57 cu yd, oak 1,225 sq ft, tile 575 sq ft at 15 %, 19 windows...), material swaps, the patio
addition, provenance (blueprint-verified rooms → verified flooring lines) and settings clamping.
