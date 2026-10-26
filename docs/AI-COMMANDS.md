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

## Interpreter (`POST /api/ai/assistant`)

```
message ──► compact context ──► Claude (gc_commands tool) ──► shape check ──► dimension guard ──► building check ──► plan
            ids, names, faces,     or the cache (same model,     schema +        sizes not said →     targets, surfaces,     instant / preview /
            finishes, designs      selection and message)        registry        meta.inferred        opening fit           rejected (with reasons)
```

Request: `{ message, projectId?, designId?, model?, selection?, history? }`. `model` is the building on screen (unsaved
edits included); without it the saved design is loaded. Response:

```json
{ "logId": "…", "reply": "Proposed moving the window 2 ft left.", "clarification": null, "engine": "claude",
  "commands": [ { "command": { "type": "MOVE_OBJECT", "payload": { "target": { "kind": "selected" }, "along": -24 }, "meta": { "inferred": [] } },
                  "risk": "geometry", "needsConfirmation": true, "confirmReason": "Geometry changes are previewed before they are applied.",
                  "warnings": [], "targets": ["o-f1-front-2"] } ],
  "rejected": [ { "type": "CHECK_COMPLIANCE", "reason": "Code checks aren’t available yet…" } ] }
```

- **Claude** sees only a compact context (ids, names, faces, finishes, rooms, designs; no coordinates) inside
  `<context>` marked as data, and must answer through the `gc_commands` tool whose items are the command JSON Schema.
  Calls are logged to the Billing Monitor (`workflow = ai_assistant`), respect its budgets, and count against
  `STUDIO3D_AI_PER_DAY`. The system prompt is in `ai-commands/prompt.ts`.
- **Dimension guard** (`dimension-guard.ts`): reads the lengths the contractor actually said ("two feet", `3' 6"`,
  "16x12") and adds any geometry size that doesn't match one of them to `meta.inferred`, so the preview says the
  assistant chose it.
- **Cache**: identical message + model state + selection + designs → the stored answer, re-validated (500 entries,
  10 minutes). Follow-ups with history are never cached.
- **No key**: `503 NOT_CONFIGURED`; the 3D Studio's on-device parser keeps common requests working.

## Command log, undo/redo and audit trail

Every request is stored in `ai_command_log` (migration `013`): message, engine, reply, planned and rejected commands,
status and a status history.

| Endpoint | |
|---|---|
| `POST /api/ai/commands/:id/status` | `{ status, version?, note? }`: proposed → executed / partially-executed / rejected; executed → undone → redone → undone… (other transitions: `409`) |
| `GET /api/ai/commands?projectId=&limit=` | audit trail |
| `GET /api/ai/commands/catalog` | every command with family, risk, availability and reason |

Rollback of the model itself uses design versions (`RESTORE_DESIGN`, always confirmed); undo/redo inside a session is
the studio's history, reported back through the status hooks.

The 3D Studio's `/api/studio3d/interpret` now runs this interpreter and converts to the studio's flat format; the old
studio-only AI call was removed (one AI integration, not two).
