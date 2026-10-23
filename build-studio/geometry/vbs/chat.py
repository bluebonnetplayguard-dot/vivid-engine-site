"""One Build-mode chat turn: spec, template or plain message in; model, checks and change summary out."""
from __future__ import annotations

from . import validate as validators
from .diff import diff as diff_models, summarize
from .model import SpecError, build
from .quickparse import parse as quick_parse
from .templates import from_template
from .viewer_export import to_viewer_json

NOTICE = "Not for construction or permit unless reviewed and sealed by a licensed professional engineer or architect where required."


class NeedsPlanner(Exception):
    """The quick parser can't read this request; the AI planner has to write the spec."""


def handle_build(message: str = "", spec: dict | None = None, template: str | None = None,
                 params: dict | None = None, previous_spec: dict | None = None) -> dict:
    if spec is None and template:
        merged = dict(params or {})
        if previous_spec and template == "deck":   # a follow-up keeps every size not mentioned
            pp = previous_spec.get("parameters", {})
            for new, old in (("width", "deck_width"), ("depth", "deck_depth"), ("height", "deck_height"),
                             ("joist_spacing", "joist_spacing"), ("beam_setback", "beam_setback")):
                if old in pp and new not in merged:
                    merged[new] = pp[old]
        spec = from_template(template, merged)
    if spec is None:
        hit = quick_parse(message)
        if not hit:
            raise NeedsPlanner(message)
        spec = from_template(*hit)
    model = build(spec)
    previous = None
    if previous_spec:
        try:
            previous = build(previous_spec)
        except ValueError:
            previous = None
    report = validators.run(model)
    return {
        "spec": spec,
        "summary": summarize(model),
        "changes": diff_models(previous, model),
        "log": model.log,
        "viewer": to_viewer_json(model),
        "validation": {"ok": report.ok, "findings": [f.__dict__ for f in report.findings], "scenes": report.scenes()},
        "notice": NOTICE,
    }
