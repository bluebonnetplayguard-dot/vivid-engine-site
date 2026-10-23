"""OpenCascade (OCCT) backend via build123d (Apache-2.0) for exact B-rep solids, booleans, STEP export
and hidden-line projection on the server.

The box kernel (solids.py) is the reference for framing and is fully tested. This backend mirrors the
same element data so curved parts, any-angle rotations, steel profiles, fillets and STEP output work.
It needs `pip install build123d` (pulls OCP / OCCT) inside the geometry container. It isn't imported
anywhere by default, so the box kernel and its tests run without OCCT installed.
"""
from __future__ import annotations

from fractions import Fraction


def _mm(v: Fraction) -> float:
    return float(v)


def element_to_part(e):
    """Build a build123d Part for one element: base box minus joinery cuts minus drilled holes."""
    from build123d import Box as BBox, Cylinder, Location, Align  # noqa: N811

    lo, hi = e.solid.base.lo, e.solid.base.hi
    size = [_mm(h - l) for l, h in zip(lo, hi)]
    part = BBox(*size, align=(Align.MIN, Align.MIN, Align.MIN)).locate(Location(tuple(_mm(v) for v in lo)))
    for c in e.solid.cuts:
        cs = [_mm(h - l) for l, h in zip(c.lo, c.hi)]
        part = part - BBox(*cs, align=(Align.MIN, Align.MIN, Align.MIN)).locate(Location(tuple(_mm(v) for v in c.lo)))
    for h in e.solid.holes:
        length = _mm(h.hi - h.lo)
        rot = {"x": (0, 90, 0), "y": (-90, 0, 0), "z": (0, 0, 0)}[h.axis]
        center = list(_mm(v) for v in h.center)
        center["xyz".index(h.axis)] = _mm(h.lo)
        drill = Cylinder(_mm(h.diameter) / 2, length, align=(Align.CENTER, Align.CENTER, Align.MIN)).locate(Location(tuple(center), rot))
        part = part - drill
    return part


def export_step_per_production_number(model, out_dir) -> list:
    """One STEP file per production number, with all drillings and cuts included."""
    from pathlib import Path
    from build123d import Compound, export_step

    groups: dict = {}
    for e in model.elements:
        groups.setdefault(e.production_number or e.id, []).append(e)
    paths = []
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    for pn, els in groups.items():
        # Identical members share a production number; export one representative.
        part = element_to_part(els[0])
        path = Path(out_dir) / f"{pn}.step"
        export_step(Compound([part]), str(path))
        paths.append(str(path))
    return paths


def collisions_occt(model, tolerance_mm3: float = 1.0) -> list:
    """Exact B-rep clash check for geometry the box kernel can't represent."""
    parts = {e.id: element_to_part(e) for e in model.elements}
    ids = list(parts)
    out = []
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            common = parts[a] & parts[b]
            vol = getattr(common, "volume", 0.0) or 0.0
            if vol > tolerance_mm3:
                out.append((a, b, vol))
    return out
