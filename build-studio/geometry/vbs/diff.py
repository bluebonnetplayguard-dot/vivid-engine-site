"""Before/after summary of a change, shown to the user before they approve it."""
from __future__ import annotations

from collections import Counter

from .units import format_length


def _label(e) -> str:
    """"Post 6x6" -> "Post", "Beam (2) 2x10" -> "Beam": sizes are left out of counts."""
    words = [w for w in e.name.split(" (")[0].split() if not any(ch.isdigit() for ch in w)]
    return " ".join(words) or e.type.capitalize()


def summarize(model) -> list:
    counts = Counter(_label(e) for e in model.elements)
    return [f"{n} {label.lower()}{'s' if n != 1 and not label.lower().endswith('s') else ''}" for label, n in counts.most_common()]


def diff(old, new) -> list:
    """Plain-language changes, e.g. ["3 joists added", "beam lengthened from 12'-0\" to 16'-0\""]."""
    if old is None:
        return [f"New model: {', '.join(summarize(new))}"]
    out = []
    oc, nc = Counter(_label(e) for e in old.elements), Counter(_label(e) for e in new.elements)
    for label in sorted(set(oc) | set(nc)):
        d = nc[label] - oc[label]
        noun = label.lower() + ("s" if abs(d) != 1 else "")
        if d > 0:
            out.append(f"{d} {noun} added")
        elif d < 0:
            out.append(f"{-d} {noun} removed")
    old_by_id = {e.id: e for e in old.elements}
    resized = Counter()
    moved = Counter()
    for e in new.elements:
        o = old_by_id.get(e.id)
        if not o:
            continue
        if o.length != e.length:
            if e.source in ("beam", "ledger", "rim-front") or e.source == e.id:
                verb = "lengthened" if e.length > o.length else "shortened"
                out.append(f"{_label(e)} {verb} from {format_length(o.length)} to {format_length(e.length)}")
            else:
                resized[_label(e)] += 1
        elif o.solid.base != e.solid.base:
            moved[_label(e)] += 1
    for label, n in resized.items():
        out.append(f"{n} {label.lower()}{'s' if n != 1 else ''} re-cut to a new length")
    for label, n in moved.items():
        out.append(f"{n} {label.lower()}{'s' if n != 1 else ''} moved")
    po, pn = old.params, new.params
    for k in sorted(set(po) & set(pn)):
        if po[k] != pn[k] and k in ("deck_height", "joist_spacing"):
            out.append(f"{k.replace('_', ' ').capitalize()}: {format_length(po[k])} → {format_length(pn[k])}")
    return out or ["No geometry changes"]
