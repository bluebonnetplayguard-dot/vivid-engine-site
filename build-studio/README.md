# Vivid Build Studio

The AI writes a parametric **Model Spec** (JSON). A deterministic geometry engine builds exact solids from it, validators check every change, and true-to-scale drawings and exports come out the other end. The AI never draws geometry itself.

```
prompt / upload → AI router → Model Spec (schema-validated) → geometry engine → validators → viewer, drawings, exports
```

## What's here

| Path | What |
|---|---|
| `schema/model-spec.schema.json` | Model Spec: units, elements, patterns, layered buildups, joints, operations, constraints |
| `examples/` | Deck 12×10, half-lap crossing with a through-bolt, ventilated rainscreen wall |
| `geometry/vbs/` | Engine: exact rational units (mm as fractions), safe expressions, box kernel, half-lap, drilling, validators, PDF sheets, viewer export |
| `geometry/vbs/occt_backend.py` | build123d/OpenCascade backend for the server: any-angle geometry, STEP per production number, B-rep clash checks |
| `geometry/app.py` | FastAPI service: `/build`, `/validate`, `/sheet.pdf` |
| `geometry/tests/` | 16 tests, including the PDF scale test (10 ft at 1/4"=1'-0" measures 180 pt) |
| `viewer/` | three.js viewer with select, measure (snaps to corners), explode and decking toggle |
| `out/` | Generated deck sheet (PDF) and viewer data |

## Run

```
cd build-studio/geometry
python3 -m unittest discover -s tests -v       # needs reportlab, jsonschema, pdfplumber
python3 -c "from vbs import load; from vbs.drawing import render_sheet; open('deck.pdf','wb').write(render_sheet(load('../examples/deck.json')))"
pip install fastapi uvicorn build123d && uvicorn app:app --port 8090    # server
```

## Exactness

- Lengths are exact fractions of a millimetre (1 in = 127/5 mm exactly), so 1/16" and 1/32" never pick up float error. They're rounded only for display.
- Paper length in points = real mm × scale factor × 72/25.4, computed exactly. 12 ft at 1/4"=1'-0" is exactly 216 pt (3 in).
- Every sheet carries a graphic scale bar, a 1-inch check square, "Print at 100% / Actual Size", and the not-for-construction banner.

## Next (per the plan)

3D viewer in the app (section planes, color by attribute) → cut list CSV and one STEP per production number → drawing-to-model with the read-vs-assumed table → Actions, then Plugins with SDK, sandbox, tests and versioning.
