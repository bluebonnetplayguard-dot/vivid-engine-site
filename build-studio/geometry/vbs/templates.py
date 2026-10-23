"""Starter templates: a few plain parameters in, a complete Model Spec out.

The AI planner prefers a template when the request fits one (cheap, reliable, exact) and writes a full
spec only when it doesn't. Every template output goes through the same schema and validators.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path

_HERE = Path(__file__).resolve()
EXAMPLES = next((p / "examples" for p in (_HERE.parent, *_HERE.parents) if (p / "examples" / "deck.json").exists()),
                _HERE.parents[2] / "examples")   # finds examples/ wherever the image copies it

DECK_DEFAULTS = {
    "width": "12ft",           # along the house
    "depth": "10ft",           # away from the house
    "height": "30in",          # top of decking above grade
    "joist_spacing": "16in",
    "beam_setback": "2ft",     # beam distance in from the outer edge (cantilever)
    "name": None,
    "client": None,
}

TEMPLATES = {
    "deck": {
        "label": "Attached deck",
        "params": {
            "width": "Deck length along the house, e.g. 16ft",
            "depth": "How far the deck comes out from the house, e.g. 12ft",
            "height": "Height of the deck surface above grade, e.g. 30in",
            "joist_spacing": "Joist spacing on center: 12in, 16in or 24in",
            "beam_setback": "How far the beam sits in from the outer edge, e.g. 2ft",
        },
    },
}


def deck(**kw) -> dict:
    p = {**DECK_DEFAULTS, **{k: v for k, v in kw.items() if v not in (None, "")}}
    spec = json.loads((EXAMPLES / "deck.json").read_text())
    spec = copy.deepcopy(spec)
    spec["parameters"]["deck_width"] = p["width"]
    spec["parameters"]["deck_depth"] = p["depth"]
    spec["parameters"]["deck_height"] = p["height"]
    spec["parameters"]["joist_spacing"] = p["joist_spacing"]
    spec["parameters"]["beam_setback"] = p["beam_setback"]
    from .model import build  # local import avoids a cycle
    from .units import format_length
    m = build(spec)
    w, d = format_length(m.params["deck_width"]), format_length(m.params["deck_depth"])
    short = lambda t: t[:-4] + "'" if t.endswith("'-0\"") else t   # 12'-0" -> 12'
    spec["project"]["name"] = p["name"] or f"{short(w)} x {short(d)} deck"
    spec["project"]["client"] = p["client"] or ""
    spec["project"]["description"] = f"Attached deck {w} along the house by {d} out, surface {format_length(m.params['deck_height'])} above grade, joists {format_length(m.params['joist_spacing'], 'in')} o.c."
    return spec


BUILDERS = {"deck": deck}


def from_template(name: str, params: dict) -> dict:
    if name not in BUILDERS:
        raise ValueError(f"Unknown template {name!r}. Available: {', '.join(BUILDERS)}")
    return BUILDERS[name](**(params or {}))
