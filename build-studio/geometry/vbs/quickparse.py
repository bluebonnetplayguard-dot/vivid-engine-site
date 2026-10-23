"""Fast, offline reading of common build requests ("12x16 deck 30 inches high, joists 12 in o.c.").

Used when the AI planner is unavailable, and as a first pass so simple requests cost no credits.
Returns (template, params) or None if the request needs the AI planner.
"""
from __future__ import annotations

import re

UNIT = r"(?:'|\"|(?:ft|feet|foot|inches|inch)\b|in\b(?!\s+(?:my|the|a|our|your|an)\b))"   # "in my backyard" is not inches
NUM = r"\d+(?:\.\d+)?"


def _len(value: str, unit: str | None, default_unit: str) -> str:
    u = (unit or default_unit).lower()
    u = "ft" if u in ("'", "ft", "feet", "foot") else "in"
    return f"{value}{u}"


def parse(message: str):
    text = message.lower().replace("×", "x")
    if not re.search(r"\bdecks?\b", text):
        return None
    if re.search(r"\b(stairs?|railings?|pergola|roof|gazebo|rail|steps?)\b", text):
        return None   # beyond the deck template: let the planner handle it
    params: dict = {}
    # 12x16, 12 x 16 ft, 12' x 16', 12 by 16
    m = None
    for cand in re.finditer(rf"({NUM})\s*({UNIT})?\s*(?:x|by)\s*({NUM})\s*({UNIT})?", text):
        if re.match(r"\s*(?:joists?|beams?|posts?|boards?|lumber|stock)", text[cand.end():]):
            continue   # 2x10 joists is a lumber size, not the deck size
        m = cand
        break
    if m:
        a, ua, b, ub = m.groups()
        unit = ua or ub
        params["width"] = _len(a, unit, "ft")
        params["depth"] = _len(b, ub or ua, "ft")
    # 30 inches high / 30" tall / 2.5 ft off the ground / height 30in
    h = re.search(rf"({NUM})\s*({UNIT})\s*(?:high|tall|off the ground|above grade|above the ground)", text) or \
        re.search(rf"height\s*(?:of|is|=|:)?\s*({NUM})\s*({UNIT})", text)
    hc = re.search(rf"((?:{NUM}\s*{UNIT}\s*)+)(?:high|tall|off the ground|above grade|above the ground)", text)
    if hc:
        hv = re.sub(r"\s+", "", hc.group(1))
        hv = re.sub(r"(?:inches|inch)", "in", hv); hv = re.sub(r"(?:feet|foot)", "ft", hv)
        params["height"] = hv
    elif h:
        params["height"] = _len(h.group(1), h.group(2), "in")
    s = re.search(rf"({NUM})\s*({UNIT})?\s*(?:o\.?c\.?|on center|on-center|spacing)", text) or re.search(rf"joists?\s*(?:at|@)\s*({NUM})\s*({UNIT})?", text)
    if s:
        params["joist_spacing"] = _len(s.group(1), s.group(2), "in")
    if "width" not in params:
        return None   # no size given: ask instead of guessing
    return ("deck", params)
