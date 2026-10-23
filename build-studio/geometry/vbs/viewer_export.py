"""Geometry for the three.js viewer: each element as disjoint boxes in millimetres, plus attributes."""
from __future__ import annotations

from .units import format_length


def to_viewer_json(model) -> dict:
    mats = model.spec.get("materials", {})
    out = []
    for e in model.elements:
        cells = e.solid.cells() if e.solid.cuts else [e.solid.base]
        out.append({
            "id": e.id, "name": e.name, "type": e.type, "material": e.material,
            "materialName": mats.get(e.material or "", {}).get("name", e.material or ""),
            "color": mats.get(e.material or "", {}).get("color", "#9aa7bd"),
            "nominal": e.nominal, "length": format_length(e.length),
            "productionNumber": e.production_number, "assembly": e.assembly,
            "boxes": [[float(v) for v in (*b.lo, *b.hi)] for b in cells],
            "holes": [{"axis": h.axis, "center": [float(v) for v in h.center], "diameter": float(h.diameter), "lo": float(h.lo), "hi": float(h.hi)} for h in e.solid.holes],
        })
    b = model.bounds
    return {"project": model.spec.get("project", {}), "units": "mm", "bounds": [[float(v) for v in b.lo], [float(v) for v in b.hi]], "elements": out}
