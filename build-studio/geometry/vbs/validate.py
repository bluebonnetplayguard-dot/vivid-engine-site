"""Validators that run after every change. Findings are grouped by fault type, one saved scene per group."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from fractions import Fraction
from itertools import combinations

from .solids import overlap_volume
from .units import FOOT, INCH, format_length

# Plausibility limits per element type (longest dimension). A 40 m rafter is a typo.
MAX_LENGTH = {"beam": 60 * FOOT, "post": 30 * FOOT, "plate": 40 * FOOT, "panel": 40 * FOOT, "sheet": 40 * FOOT, "profile": 80 * FOOT, "fastener": 4 * FOOT}
SLIVER = Fraction(1)            # mm: anything thinner is a sliver
MIN_REMAINING = Fraction(2, 5)  # at least 40% of depth left after cuts


@dataclass
class Finding:
    fault: str            # unit-sanity | collision | defect | tolerance | constraint
    message: str
    elements: list
    severity: str = "error"
    suggestion: str = ""


@dataclass
class Report:
    findings: list = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not any(f.severity == "error" for f in self.findings)

    def scenes(self) -> dict:
        """One filtered view per fault type: the element ids to show."""
        groups = defaultdict(set)
        for f in self.findings:
            groups[f.fault].update(f.elements)
        return {k: sorted(v) for k, v in groups.items()}

    def by_fault(self) -> dict:
        g = defaultdict(list)
        for f in self.findings:
            g[f.fault].append(f)
        return dict(g)


def _crossing_members(a, b) -> bool:
    return a.type in ("beam", "plate") and b.type in ("beam", "plate") and a.rotation != b.rotation


def run(model, *, check_collisions: bool = True) -> Report:
    r = Report()
    fmt = lambda v: format_length(v)
    for e in model.elements:
        sizes = e.solid.base.size
        if any(s <= 0 for s in sizes):
            r.findings.append(Finding("unit-sanity", f"{e.id} has a zero or negative size", [e.id]))
        limit = MAX_LENGTH.get(e.type)
        if limit and max(sizes) > limit:
            r.findings.append(Finding("unit-sanity", f"{e.id} is {fmt(max(sizes))} long, which isn't plausible for a {e.type}. Check the units.", [e.id]))
        if not e.material:
            r.findings.append(Finding("defect", f"{e.id} has no material", [e.id], severity="warning", suggestion="Set a material so it shows on the cut list"))
        kind = model.spec.get("materials", {}).get(e.material or "", {}).get("kind")
        if min(sizes) < SLIVER and kind != "membrane":
            r.findings.append(Finding("defect", f"{e.id} is a sliver ({fmt(min(sizes))} thick)", [e.id]))
        # Material left after joinery cuts
        for c in e.solid.cuts:
            for i in range(3):
                full = sizes[i]
                cut = c.hi[i] - c.lo[i]
                if cut < full and (full - cut) < full * MIN_REMAINING:
                    r.findings.append(Finding("tolerance", f"{e.id} keeps only {fmt(full - cut)} of {fmt(full)} after a cut", [e.id], suggestion="Use a shallower cut or a larger member"))
        # Hole edge distance (multiple of diameter, default 1.5d)
        for h in e.solid.holes:
            k = Fraction(str(next((op.get("minEdgeDistance", 1.5) for op in model.spec.get("operations", []) if op.get("id") == h.op_id), 1.5)))
            ai = "xyz".index(h.axis)
            for i in range(3):
                if i == ai:
                    continue
                edge = min(h.center[i] - e.solid.base.lo[i], e.solid.base.hi[i] - h.center[i])
                if edge < k * h.diameter:
                    r.findings.append(Finding("tolerance", f"Hole in {e.id} is {fmt(edge)} from an edge; minimum is {fmt(k * h.diameter)} ({k}×d)", [e.id], suggestion="Move the hole or use a smaller fastener"))
                    break
    # Duplicate parts: same box and same material
    seen = {}
    for e in model.elements:
        key = (e.solid.base.lo, e.solid.base.hi, e.material)
        if key in seen:
            r.findings.append(Finding("defect", f"{e.id} duplicates {seen[key]}", [seen[key], e.id]))
        else:
            seen[key] = e.id
    if check_collisions:
        r.findings += collisions(model)
    return r


def collisions(model) -> list:
    out = []
    els = model.elements
    # Sweep on x to avoid testing every pair on big models.
    order = sorted(els, key=lambda e: e.solid.base.lo[0])
    for i, a in enumerate(order):
        for b in order[i + 1:]:
            if b.solid.base.lo[0] >= a.solid.base.hi[0]:
                break
            if a.solid.base.intersect(b.solid.base) is None:
                continue
            v = overlap_volume(a.solid, b.solid)
            if v > 0:
                tip = "Add a half-lap joint" if _crossing_members(a, b) else "Move one member or trim it to length"
                out.append(Finding("collision", f"{a.id} and {b.id} overlap by {float(v / 1000):.1f} cm³", [a.id, b.id], suggestion=tip))
    return out
