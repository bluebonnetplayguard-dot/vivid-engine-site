# Construction Configurator (`/construction`)

Pick a structure, set its options, and get a live 3D framing model with a priced materials list,
cut list, code/safety checks and exports. Runs fully in the browser (no server needed).

## Structures and options
| Type | Options |
|---|---|
| Storage shed | width, depth, wall height, skids / piers / slab, 16" or 24" studs, gable or lean-to, pitch, overhang, single / double / roll-up door, 0-6 windows, T1-11 / lap / vinyl / metal siding, shingle or metal roof |
| Garage | same as shed, slab only, overhead door (9' or 16'), side entry door |
| Deck | width, depth, height, ledger or freestanding, 12/16/24" joists, PT / cedar / composite decking, railing, stairs and stair width |
| Pergola | width, depth, clear height, footings or slab, rafter spacing, knee braces, PT or cedar, shade slats |
| Play structure | 4-6 ft fort, 4-6 ft deck, wood roof / canopy / open, slide, ladder or rock wall, 0-3 belt swings, 7/8 ft beam, surfacing type |

## What it produces
- **3D model:** every stud, plate, header, jack, king, cripple, joist, rafter, ridge, beam, post, baluster, stringer and tread as a real-size member. Layers can be switched on/off, X-ray shows framing through finishes, with 3D/front/side/top views; click any part for its size and length.
- **Takeoff:** lumber is packed into 8-20 ft stock lengths (first-fit decreasing, 1/8" kerf). Sheet goods, roofing (bundles, underlayment, drip edge, ridge), concrete (yd³ or bags), rebar, hardware, doors/windows and surfacing are counted too.
- **Estimate:** editable unit prices (saved per device), labor rate, tax, markup and waste.
- **Checks:** joist span vs. spacing, LVL header for wide openings, shingle minimum pitch, guard required over 30", stair rise and handrail, permit size, CPSC use zone and surfacing depth vs. fall height.
- **Exports:** PDF estimate (with 3D image), estimate CSV, cut list CSV, PNG, model JSON, share link (options in the URL).

## Code
- `lumber.js` actual sizes, stock lengths, ft-in formatting
- `model.js` model builder, lumber packing, cut list
- `building.js` sheds/garages · `deck.js` decks/pergolas · `playset.js` play structures + CPSC surfacing
- `index.js` type registry, option schema, pricing and `estimate()`
- UI: `src/pages/ConstructionConfigurator.jsx`, `src/components/construction/*`
- Tests: `node tests/construction.test.mjs`

Coordinates are inches, x = width, y = depth, z = up. The JSON export uses the same frame, so the
Build Studio geometry service (`build-studio/`) can turn a model into exact solids and to-scale drawings later.

Member sizes are rule-of-thumb picks for preview and estimating, not engineering. Every export says so.
Playground use zones and loose-fill depths follow the CPSC Public Playground Safety Handbook (Pub. 325).
