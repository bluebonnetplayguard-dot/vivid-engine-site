# AI commands

Every action the AI assistant can take is an **AICommand**: data, never code.

```ts
{ type: 'MOVE_OBJECT', payload: { target: { kind: 'selected' }, along: -24 }, meta: { inferred: [], reason: 'Contractor asked to move the window 2 ft left' } }
```

Code: `backend/src/ai-commands/` (the spec's `/backend/ai/` in this repo's `src/` layout).
`command-schema.ts` = types, payload schemas, registry, shape validation; `validators/` = checks against the real building.

## Command types (24)

| Family | Type | Risk | Available |
|---|---|---|---|
| studio | SELECT_OBJECT, CHANGE_CAMERA, SET_VIEW, TOGGLE_LAYER, SET_LIGHTING | view (instant, not saved) | yes |
| studio | UPDATE_MATERIAL, UPDATE_COLOR | appearance (instant, undoable, saved) | yes |
| studio | MOVE_OBJECT, RESIZE_OBJECT, ADD_COMPONENT, REMOVE_COMPONENT | geometry (previewed, applied on approval) | yes |
| studio | GENERATE_RENDER | compute | yes |
| studio | CREATE_DESIGN_VARIATION (finish commands only) | project | yes |
| construction | CALCULATE_MATERIALS, GENERATE_ESTIMATE, PRODUCE_PROPOSAL | compute | yes |
| construction | CREATE_SCHEDULE, CHECK_COMPLIANCE, CREATE_CHANGE_ORDER | compute | **not yet**, rejected with a reason |
| project | SAVE_DESIGN, LOAD_MODEL | project | yes |
| project | RESTORE_DESIGN | destructive (always confirmed) | yes |
| project | EXPORT_DRAWINGS, LOAD_BLUEPRINT | | **not yet** |

Payload types: `GeometryPayload`, `MaterialPayload`, `CameraPayload`, `TakeoffPayload`, `EstimatePayload` (and the
per-command zod schemas). Lengths are inches. Ids match `^[A-Za-z0-9_-]{1,80}$`; colors are named or `#rrggbb`;
materials come from the shared material list.

## Two layers of validation

1. **Shape** (`validateAICommand`, `validateBatch`): known type, strict payload (no extra fields), bounded numbers,
   supported. Errors carry a code: `NOT_AN_OBJECT`, `UNKNOWN_TYPE`, `BAD_PAYLOAD`, `BAD_META`, `UNSUPPORTED`,
   `TOO_MANY` (25 per answer).
2. **Against the building** (`validateAgainstModel`): the target exists (or "Nothing is selected"); the material fits
   the surface; a moved or resized opening still fits its wall (same rules as the studio: 4" from corners and
   neighbours, 6" header, doors on the floor); one target only for geometry; walls, rooms, roofs, the slab and floor
   framing can't be moved, resized or removed by the assistant; rooms and floors named in camera commands exist;
   designs named in LOAD_MODEL and estimate alternates exist.

## Confirmation

- Geometry commands are always previewed. When `meta.inferred` lists a size the AI chose itself, the preview says
  so ("The assistant chose width without you giving a size"). A guessed dimension can't reach the model unapproved.
- RESTORE_DESIGN always asks.
- Finish changes touching more than 12 elements ask first.

## Studio compatibility

The studio's flat format `{ type, ...fields }` converts with `fromStudioCommand` / `toStudioCommand`; every
quick-parser output and style preset round-trips (tested). `aiCommandJsonSchema()` produces the JSON Schema for
the Claude tool (supported commands only).
