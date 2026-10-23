"""Turns a Model Spec into exact element solids: parameters, sections, patterns, buildups, joints, drilling."""
from __future__ import annotations

import copy
import json
from dataclasses import dataclass, field
from fractions import Fraction
from pathlib import Path

from .expr import evaluate, resolve_parameters
from .solids import Box, Hole, Solid, world_extents

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "schema" / "model-spec.schema.json"
AXES = {"x": 0, "y": 1, "z": 2}


class SpecError(ValueError):
    pass


@dataclass
class Element:
    id: str
    type: str
    name: str
    material: str | None
    nominal: str | None
    width: Fraction           # section width (local Y)
    depth: Fraction           # section depth (local Z)
    length: Fraction          # local X
    rotation: object
    solid: Solid
    attributes: dict = field(default_factory=dict)
    assembly: str | None = None
    source: str = ""          # spec element or pattern id

    @property
    def production_number(self) -> str:
        return self.attributes.get("productionNumber", "")


@dataclass
class Model:
    spec: dict
    params: dict
    elements: list
    log: list = field(default_factory=list)   # human-readable summary of what was built or changed

    def by_id(self, eid: str) -> Element:
        for e in self.elements:
            if e.id == eid:
                return e
        raise SpecError(f"No element {eid!r}")

    def members_of(self, ref: str) -> list:
        """An element id, or a pattern id (all its members)."""
        hits = [e for e in self.elements if e.id == ref or e.source == ref]
        if not hits:
            raise SpecError(f"No element or pattern {ref!r}")
        return hits

    @property
    def bounds(self) -> Box:
        los = [min(e.solid.base.lo[i] for e in self.elements) for i in range(3)]
        his = [max(e.solid.base.hi[i] for e in self.elements) for i in range(3)]
        return Box(tuple(los), tuple(his))


def validate_schema(spec: dict) -> list:
    try:
        import jsonschema
    except ImportError:  # validation still happens server-side where jsonschema is installed
        return []
    schema = json.loads(SCHEMA_PATH.read_text())
    v = jsonschema.Draft202012Validator(schema)
    return [f"{'/'.join(map(str, e.path)) or '(root)'}: {e.message}" for e in sorted(v.iter_errors(spec), key=lambda e: list(e.path))]


def _section(spec: dict, ref, names) -> tuple:
    sec = spec.get("sections", {}).get(ref) if isinstance(ref, str) else ref
    if sec is None:
        raise SpecError(f"Unknown section {ref!r}")
    return evaluate(sec["width"], names), evaluate(sec["depth"], names), sec.get("nominal") or (ref if isinstance(ref, str) else None)


def _make_element(spec, raw: dict, names: dict, offset=(0, 0, 0), eid=None, source="") -> Element:
    width, depth, nominal = _section(spec, raw.get("section"), names)
    length = evaluate(raw["length"], names)
    rot = raw["placement"].get("rotation", "along-x")
    origin = [evaluate(v, names) + Fraction(o) for v, o in zip(raw["placement"]["origin"], offset)]
    ext = world_extents((length, width, depth), rot)
    if raw["placement"].get("anchor", "min-corner") != "min-corner":
        raise SpecError("anchor local-origin is handled by the OCCT backend; use min-corner with the box kernel")
    base = Box(tuple(origin), tuple(o + e for o, e in zip(origin, ext)))
    return Element(id=eid or raw["id"], type=raw["type"], name=raw.get("name", raw["id"]), material=raw.get("material"),
                   nominal=nominal, width=width, depth=depth, length=length, rotation=rot, solid=Solid(base),
                   attributes=dict(raw.get("attributes", {})), assembly=raw.get("assembly"), source=source or raw["id"])


def _expand_pattern(spec, pat: dict, names) -> list:
    count = int(evaluate(pat["count"], names))
    spacing = evaluate(pat["spacing"], names)
    axis = AXES[pat["axis"]]
    end_at = evaluate(pat["endAt"], names) if "endAt" in pat else None
    out = []
    for i in range(count):
        off = [Fraction(0)] * 3
        off[axis] = spacing * i
        if end_at is not None and i == count - 1 and count > 1:
            start = evaluate(pat["template"]["placement"]["origin"][axis], names)
            off[axis] = end_at - start
        out.append(_make_element(spec, pat["template"], names, off, eid=f"{pat['id']}-{i + 1}", source=pat["id"]))
    return out


def _expand_buildup(spec, bu: dict, names) -> list:
    out = []
    ox, oy, oz = (evaluate(v, names) for v in bu["origin"])
    width, height = evaluate(bu["width"], names), evaluate(bu["height"], names)
    y = oy
    sign = 1 if bu.get("outsideFace", "-y") == "-y" else -1
    for n, layer in enumerate(bu["layers"], start=1):
        t = evaluate(layer["thickness"], names)
        y0, y1 = (y, y + t) if sign == 1 else (y - t, y)
        lid = f"{bu['id']}-l{n}"
        if layer["fill"] == "solid":
            out.append(Element(id=lid, type="sheet", name=layer["name"], material=layer["material"], nominal=None,
                               width=t, depth=height, length=width, rotation="along-x",
                               solid=Solid(Box((ox, y0, oz), (ox + width, y1, oz + height))),
                               attributes={"group": layer["name"], "layer": n}, source=bu["id"]))
        elif layer["fill"] == "members":
            mw, md, nominal = _section(spec, layer["section"], names)
            if md != t:
                raise SpecError(f"Layer {layer['name']!r}: member depth {md} mm must equal layer thickness {t} mm")
            spacing = evaluate(layer["spacing"], names)
            count = int(width // spacing) + 1
            xs = [ox + spacing * i for i in range(count - 1)] + [ox + width - mw]
            for i, x in enumerate(xs, start=1):
                out.append(Element(id=f"{lid}-m{i}", type="post", name=layer["name"].split(" ")[0].rstrip("s") or "Member", material=layer["material"],
                                   nominal=nominal, width=mw, depth=md, length=height, rotation="along-z",
                                   solid=Solid(Box((x, y0, oz), (x + mw, y1, oz + height))),
                                   attributes={"group": layer["name"], "layer": n}, source=f"{bu['id']}-l{n}"))
            if layer.get("infill"):
                for i in range(len(xs) - 1):
                    a, b = xs[i] + mw, xs[i + 1]
                    if b > a:
                        out.append(Element(id=f"{lid}-fill{i + 1}", type="panel", name="Infill", material=layer["infill"], nominal=None,
                                           width=t, depth=height, length=b - a, rotation="along-x",
                                           solid=Solid(Box((a, y0, oz), (b, y1, oz + height))),
                                           attributes={"group": layer["name"], "layer": n}, source=f"{bu['id']}-l{n}-infill"))
        y = y1 if sign == 1 else y0
    return out


def build(spec: dict) -> Model:
    errors = validate_schema(spec)
    if errors:
        raise SpecError("Spec doesn't match the schema:\n  " + "\n  ".join(errors[:20]))
    names = resolve_parameters(spec.get("parameters", {}))
    elements: list = []
    for raw in spec.get("elements", []):
        elements += _expand_pattern(spec, raw, names) if "pattern" in raw else [_make_element(spec, raw, names)]
    for bu in spec.get("buildups", []):
        elements += _expand_buildup(spec, bu, names)
    ids = [e.id for e in elements]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise SpecError(f"Duplicate element ids: {sorted(dupes)}")
    model = Model(spec=spec, params=names, elements=elements)
    model.log.append(f"Built {len(elements)} elements")
    from .ops import apply_joints, apply_operations  # local import avoids a cycle
    apply_joints(model)
    apply_operations(model)
    return model


def load(path) -> Model:
    return build(json.loads(Path(path).read_text()))


def with_parameter(spec: dict, name: str, value) -> dict:
    """Copy of the spec with one parameter changed; rebuild to update everything that depends on it."""
    s = copy.deepcopy(spec)
    s.setdefault("parameters", {})[name] = value
    return s
