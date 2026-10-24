"""Joinery recipes and machining operations on the exact box kernel."""
from __future__ import annotations

from fractions import Fraction

from .expr import evaluate
from .solids import Box, Hole

AXES = {"x": 0, "y": 1, "z": 2}


class JointError(ValueError):
    pass


def half_lap(model, a_id: str, b_id: str, upper: str | None = None) -> Box:
    """Cut two crossing members to half depth over their overlap so their faces sit flush.

    The overlap is the intersection of the two members. The lap is cut across the axis both members
    share at full height (usually Z): the upper member loses the bottom half of the overlap, the
    lower member loses the top half.
    """
    a, b = model.by_id(a_id), model.by_id(b_id)
    region = a.solid.base.intersect(b.solid.base)
    if region is None:
        raise JointError(f"{a_id} and {b_id} don't overlap, so there's nothing to half-lap")
    # Stacking axis: the one where both members span the whole overlap and their lengths run elsewhere.
    candidates = [i for i in range(3)
                  if a.solid.base.lo[i] == region.lo[i] and a.solid.base.hi[i] == region.hi[i]
                  and b.solid.base.lo[i] == region.lo[i] and b.solid.base.hi[i] == region.hi[i]]
    if not candidates:
        raise JointError(f"{a_id} and {b_id} aren't in the same plane, so a half-lap doesn't fit. Try a notch.")
    axis = 2 if 2 in candidates else candidates[0]
    mid = (region.lo[axis] + region.hi[axis]) / 2
    top, bottom = (a, b) if (upper or a_id) == a_id else (b, a)
    lo_half = Box(region.lo, tuple(mid if i == axis else region.hi[i] for i in range(3)))
    hi_half = Box(tuple(mid if i == axis else region.lo[i] for i in range(3)), region.hi)
    top.solid.cuts.append(lo_half)
    bottom.solid.cuts.append(hi_half)
    model.log.append(f"Half-lap {top.id} over {bottom.id}: each cut {float((region.hi[axis] - region.lo[axis]) / 2):.1f} mm deep over the overlap")
    return region


def drill(model, op: dict) -> int:
    """Drill a hole along an axis through the listed targets. Returns how many members were drilled."""
    names = model.params
    axis = op.get("axis", "z")
    ai = AXES[axis]
    at = tuple(evaluate(v, names) for v in op["at"])
    dia = evaluate(op["diameter"], names)
    through = str(op.get("depth", "through")) == "through"
    depth = None if through else evaluate(op["depth"], names)
    targets = [e for ref in op.get("targets", []) for e in model.members_of(ref)]
    drilled = 0
    for e in targets:
        b = e.solid.base
        others = [i for i in range(3) if i != ai]
        if not all(b.lo[i] < at[i] < b.hi[i] for i in others):
            continue  # hole line misses this member
        lo, hi = b.lo[ai], b.hi[ai]
        if not through:
            hi = min(hi, at[ai])
            lo = max(lo, at[ai] - depth)
            if lo >= hi:
                continue
        e.solid.holes.append(Hole(axis=axis, center=at, diameter=dia, lo=lo, hi=hi,
                                  countersink=op.get("countersink") if drilled == 0 else None, op_id=op.get("id", "")))
        drilled += 1
    if drilled == 0:
        raise JointError(f"Drill {op.get('id', '')} at {tuple(float(v) for v in at)} doesn't pass through any target")
    model.log.append(f"Drilled {float(dia):.1f} mm hole {'through' if through else 'blind'} {drilled} member(s)")
    return drilled


def apply_joints(model) -> None:
    for j in model.spec.get("joints", []):
        if j["type"] == "half-lap":
            half_lap(model, j["members"][0], j["members"][1], j.get("upper"))
        else:
            model.log.append(f"Joint type {j['type']} is defined in the spec; its recipe runs on the OCCT backend")


def apply_operations(model) -> None:
    for op in model.spec.get("operations", []):
        if op["type"] == "drill":
            drill(model, op)
        else:
            model.log.append(f"Operation {op['type']} runs on the OCCT backend")
