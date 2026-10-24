"""Exact solid kernel for framing work: axis-aligned boxes minus box cuts, plus drilled holes.

This "box kernel" is exact (all coordinates are Fractions of mm) and covers decks, framing, walls and
half-lap/notch/dado joinery. Curved and rotated-at-any-angle geometry goes to the OCCT backend
(occt_backend.py, build123d), which implements the same Solid interface on the server.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from fractions import Fraction
from itertools import product

F = Fraction


@dataclass(frozen=True)
class Box:
    lo: tuple  # (x, y, z) Fractions, mm
    hi: tuple

    def __post_init__(self):
        for a, b in zip(self.lo, self.hi):
            if not a < b:
                raise ValueError(f"Degenerate box {self.lo} -> {self.hi}")

    @property
    def size(self):
        return tuple(b - a for a, b in zip(self.lo, self.hi))

    @property
    def volume(self) -> Fraction:
        sx, sy, sz = self.size
        return sx * sy * sz

    def intersect(self, other: "Box") -> "Box | None":
        lo = tuple(max(a, b) for a, b in zip(self.lo, other.lo))
        hi = tuple(min(a, b) for a, b in zip(self.hi, other.hi))
        if all(a < b for a, b in zip(lo, hi)):
            return Box(lo, hi)
        return None

    def contains_point(self, p) -> bool:
        return all(a < v < b for a, v, b in zip(self.lo, p, self.hi))

    def touches(self, other: "Box") -> bool:
        """Share a face, edge or corner without overlapping volume."""
        return all(a <= d and c <= b for a, b, c, d in zip(self.lo, self.hi, other.lo, other.hi)) and self.intersect(other) is None


@dataclass
class Hole:
    axis: str            # 'x' | 'y' | 'z'
    center: tuple        # point on the axis line (Fractions)
    diameter: Fraction
    lo: Fraction         # extent along the axis inside this element
    hi: Fraction
    countersink: dict | None = None
    op_id: str = ""


@dataclass
class Solid:
    base: Box
    cuts: list = field(default_factory=list)    # Boxes removed (joinery)
    holes: list = field(default_factory=list)   # Holes (removed material ignored for clash checks)

    def cells(self, extra_boxes=()):
        """Split the solid into disjoint boxes (coordinate compression). Returns boxes inside the solid."""
        coords = [sorted({self.base.lo[i], self.base.hi[i], *[c for b in [*self.cuts, *extra_boxes] for c in (b.lo[i], b.hi[i]) if self.base.lo[i] <= c <= self.base.hi[i]]}) for i in range(3)]
        out = []
        for ix, iy, iz in product(range(len(coords[0]) - 1), range(len(coords[1]) - 1), range(len(coords[2]) - 1)):
            lo = (coords[0][ix], coords[1][iy], coords[2][iz])
            hi = (coords[0][ix + 1], coords[1][iy + 1], coords[2][iz + 1])
            mid = tuple((a + b) / 2 for a, b in zip(lo, hi))
            if self.base.contains_point(mid) and not any(c.contains_point(mid) for c in self.cuts):
                out.append(Box(lo, hi))
        return merge_cells(out)

    @property
    def volume(self) -> Fraction:
        if not self.cuts:
            return self.base.volume
        return sum((b.volume for b in self.cells()), F(0))

    def contains(self, p) -> bool:
        return self.base.contains_point(p) and not any(c.contains_point(p) for c in self.cuts)


def merge_cells(cells: list) -> list:
    """Greedy merge of adjacent cells along x, then y, then z, to keep outputs small."""
    for axis in range(3):
        cells.sort(key=lambda b: tuple(b.lo[i] for i in range(3) if i != axis) + (b.lo[axis],))
        merged: list = []
        for b in cells:
            if merged:
                p = merged[-1]
                same = all(p.lo[i] == b.lo[i] and p.hi[i] == b.hi[i] for i in range(3) if i != axis)
                if same and p.hi[axis] == b.lo[axis]:
                    lo = p.lo
                    hi = tuple(b.hi[i] if i == axis else p.hi[i] for i in range(3))
                    merged[-1] = Box(lo, hi)
                    continue
            merged.append(b)
        cells = merged
    return cells


def overlap_volume(a: Solid, b: Solid) -> Fraction:
    """Exact volume shared by two solids (0 when they only touch)."""
    region = a.base.intersect(b.base)
    if region is None:
        return F(0)
    boxes = [region, *a.cuts, *b.cuts]
    coords = [sorted({c for bx in boxes for c in (bx.lo[i], bx.hi[i]) if region.lo[i] <= c <= region.hi[i]}) for i in range(3)]
    total = F(0)
    for ix, iy, iz in product(range(len(coords[0]) - 1), range(len(coords[1]) - 1), range(len(coords[2]) - 1)):
        lo = (coords[0][ix], coords[1][iy], coords[2][iz])
        hi = (coords[0][ix + 1], coords[1][iy + 1], coords[2][iz + 1])
        mid = tuple((p + q) / 2 for p, q in zip(lo, hi))
        if a.contains(mid) and b.contains(mid):
            total += (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2])
    return total


ROTATIONS = {
    # row-major local->world. Local X = length, Y = section width, Z = section depth.
    "along-x": ((1, 0, 0), (0, 1, 0), (0, 0, 1)),
    "along-y": ((0, -1, 0), (1, 0, 0), (0, 0, 1)),      # width horizontal (world X), depth vertical
    "along-z": ((0, 1, 0), (0, 0, 1), (1, 0, 0)),       # posts, studs: length -> Z, width -> X, depth -> Y
    "along-x-on-edge": ((1, 0, 0), (0, 0, -1), (0, 1, 0)),  # length -> X, width -> Z, depth -> Y
}


def rotation_matrix(rot) -> tuple:
    m = ROTATIONS.get(rot, None) if isinstance(rot, str) else tuple(tuple(r) for r in rot)
    if m is None:
        raise ValueError(f"Unknown rotation {rot!r}")
    for row in m:
        if sorted(abs(v) for v in row) != [0, 0, 1]:
            raise ValueError("The box kernel only supports 90-degree rotations; use the OCCT backend for other angles.")
    det = (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]))
    if det != 1:
        raise ValueError("Rotation must be a proper rotation (determinant +1).")
    return m


def world_extents(dims_local, rot) -> tuple:
    m = rotation_matrix(rot)
    return tuple(sum(abs(m[i][j]) * dims_local[j] for j in range(3)) for i in range(3))
