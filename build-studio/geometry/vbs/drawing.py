"""True-to-scale vector drawing sheets (PDF).

paper_length = real_length x scale_factor. At 1/4"=1'-0" the factor is 1/48, so 12 ft prints as 3 in.
PDF units are points (1 pt = 1/72 in). All scale math is exact (Fractions) until the final draw call.
Views are exact orthographic projections of the solids; hidden faces are removed by drawing nearer
solids over farther ones with opaque fills (vector, never rasterized). Optional hidden edges are dashed.
"""
from __future__ import annotations

import datetime as _dt
import io
from collections import Counter
from dataclasses import dataclass, field
from fractions import Fraction

from reportlab.lib.colors import Color, black, white
from reportlab.pdfgen import canvas

from .units import FOOT, INCH, format_length

PT_PER_MM = Fraction(72) / Fraction(127, 5)   # 72 pt per inch / 25.4 mm per inch
PT_PER_IN = Fraction(72)

PAPER_IN = {  # width x height in inches, portrait
    "ANSI-A": (Fraction(17, 2), Fraction(11)), "ANSI-B": (Fraction(11), Fraction(17)), "ANSI-C": (Fraction(17), Fraction(22)),
    "ANSI-D": (Fraction(22), Fraction(34)), "ANSI-E": (Fraction(34), Fraction(44)),
}
PAPER_MM = {"ISO-A4": (210, 297), "ISO-A3": (297, 420), "ISO-A2": (420, 594), "ISO-A1": (594, 841), "ISO-A0": (841, 1189)}

SCALES = {
    '1/8"=1\'-0"': Fraction(1, 96), '1/4"=1\'-0"': Fraction(1, 48), '1/2"=1\'-0"': Fraction(1, 24),
    '1"=1\'-0"': Fraction(1, 12), '3"=1\'-0"': Fraction(1, 4),
    '1"=10\'': Fraction(1, 120), '1"=20\'': Fraction(1, 240), '1"=30\'': Fraction(1, 360), '1"=40\'': Fraction(1, 480),
    '1"=50\'': Fraction(1, 600), '1"=60\'': Fraction(1, 720),
    "1:1": Fraction(1), "1:5": Fraction(1, 5), "1:10": Fraction(1, 10), "1:20": Fraction(1, 20), "1:50": Fraction(1, 50),
    "1:100": Fraction(1, 100), "1:200": Fraction(1, 200),
}

BANNER = "NOT FOR CONSTRUCTION OR PERMIT UNLESS REVIEWED AND SEALED BY A LICENSED PROFESSIONAL ENGINEER OR ARCHITECT WHERE REQUIRED."
PRINT_NOTE = "PRINT AT 100% / ACTUAL SIZE. DO NOT “FIT TO PAGE.”"
INK = Color(0.08, 0.1, 0.14)
GREY = Color(0.45, 0.48, 0.55)
RED = Color(0.72, 0.1, 0.1)


def scale_factor(scale: str) -> Fraction:
    if scale in SCALES:
        return SCALES[scale]
    if scale.startswith("1:") and scale[2:].isdigit():
        return Fraction(1, int(scale[2:]))
    raise ValueError(f"Unknown scale {scale!r}")


def paper_size_pt(paper: str, orientation: str = "landscape") -> tuple:
    if paper in PAPER_IN:
        w, h = (v * PT_PER_IN for v in PAPER_IN[paper])
    elif paper in PAPER_MM:
        w, h = (Fraction(v) * PT_PER_MM for v in PAPER_MM[paper])
    else:
        raise ValueError(f"Unknown paper {paper!r}")
    return (h, w) if orientation == "landscape" else (w, h)


def real_to_paper_pt(real_mm: Fraction, scale: str) -> Fraction:
    """Exact paper length in points for a real length in mm at a drawing scale."""
    return Fraction(real_mm) * scale_factor(scale) * PT_PER_MM


@dataclass
class SheetOptions:
    paper: str = "ANSI-A"
    orientation: str = "landscape"
    scale: str = '1/4"=1\'-0"'
    sheet_number: str = "A-1"
    sheet_title: str = "Framing plan and elevations"
    date: str = field(default_factory=lambda: _dt.date.today().strftime("%m/%d/%Y"))
    hidden_lines: bool = True


# ---------- projection ----------
VIEWS = {
    # name: (u axis, u sign, v axis, v sign, depth axis, depth sign: larger = nearer)
    "plan": (0, 1, 1, 1, 2, 1),         # looking down: x right, y up, nearer = higher z
    "front": (0, 1, 2, 1, 1, 1),        # looking toward -y from the front edge: x right, z up
    "right": (1, 1, 2, 1, 0, 1),        # looking toward -x from the right: y right, z up
}


def _project(box, view):
    ua, us, va, vs, da, ds = VIEWS[view]
    u0, u1 = sorted((box.lo[ua] * us, box.hi[ua] * us))
    v0, v1 = sorted((box.lo[va] * vs, box.hi[va] * vs))
    near = box.hi[da] if ds > 0 else -box.lo[da]
    return u0, v0, u1, v1, near


class View:
    """One orthographic view placed on the sheet at an exact scale."""

    def __init__(self, c, model, view, scale, origin_pt, *, include=None, exclude_assemblies=(), hidden=False, fill_of=None):
        self.c, self.model, self.view, self.scale = c, model, view, scale
        self.k = scale_factor(scale) * PT_PER_MM
        self.els = [e for e in model.elements if (include is None or include(e)) and e.assembly not in exclude_assemblies]
        boxes = [cell for e in self.els for cell in (e.solid.cells() if e.solid.cuts else [e.solid.base])]
        proj = [_project(b, view) for b in boxes]
        self.umin = min(p[0] for p in proj); self.vmin = min(p[1] for p in proj)
        self.umax = max(p[2] for p in proj); self.vmax = max(p[3] for p in proj)
        self.ox, self.oy = origin_pt
        self.hidden = hidden
        self.fill_of = fill_of or (lambda e: white)

    @property
    def width_pt(self):
        return (self.umax - self.umin) * self.k

    @property
    def height_pt(self):
        return (self.vmax - self.vmin) * self.k

    def pt(self, u, v):
        return float(self.ox + (u - self.umin) * self.k), float(self.oy + (v - self.vmin) * self.k)

    def world_u(self, world_point):
        ua, us, va, vs, _, _ = VIEWS[self.view]
        return world_point[ua] * us, world_point[va] * vs

    def draw(self):
        c = self.c
        items = []
        for e in self.els:
            for cell in (e.solid.cells() if e.solid.cuts else [e.solid.base]):
                u0, v0, u1, v1, near = _project(cell, self.view)
                items.append((near, e, u0, v0, u1, v1))
        items.sort(key=lambda t: t[0])  # far first, near last (painter's hidden-surface removal)
        c.setLineJoin(0)
        for near, e, u0, v0, u1, v1 in items:
            x0, y0 = self.pt(u0, v0); x1, y1 = self.pt(u1, v1)
            c.setFillColor(self.fill_of(e)); c.setStrokeColor(INK); c.setLineWidth(0.5); c.setDash()
            c.rect(x0, y0, x1 - x0, y1 - y0, stroke=1, fill=1)
        if self.hidden:
            c.setStrokeColor(GREY); c.setLineWidth(0.3); c.setDash(2, 1.5)
            for near, e, u0, v0, u1, v1 in items:
                x0, y0 = self.pt(u0, v0); x1, y1 = self.pt(u1, v1)
                c.rect(x0, y0, x1 - x0, y1 - y0, stroke=1, fill=0)
            c.setDash()
        # Drilled holes in plan (axis z) as circles
        for e in self.els:
            for h in e.solid.holes:
                ua, us, va, vs, da, _ = VIEWS[self.view]
                if "xyz".index(h.axis) == da:
                    x, y = self.pt(h.center[ua] * us, h.center[va] * vs)
                    c.setStrokeColor(INK); c.setLineWidth(0.4)
                    c.circle(x, y, float(h.diameter / 2 * self.k), stroke=1, fill=0)


# ---------- annotation helpers ----------
def _text(c, x, y, s, size=7, font="Helvetica", anchor="start", color=INK):
    c.setFillColor(color); c.setFont(font, size)
    {"start": c.drawString, "middle": c.drawCentredString, "end": c.drawRightString}[anchor](x, y, s)


def dimension(c, p1, p2, offset, label, horizontal=True, size=6.5):
    """Architectural dimension: extension lines, dimension line with 45° ticks, text above the line."""
    (x1, y1), (x2, y2) = p1, p2
    c.setStrokeColor(INK); c.setLineWidth(0.35); c.setDash()
    if horizontal:
        y = (y1 if offset > 0 else min(y1, y2)) + offset if offset > 0 else min(y1, y2) + offset
        y = max(y1, y2) + offset if offset > 0 else min(y1, y2) + offset
        for x, yy in ((x1, y1), (x2, y2)):
            c.line(x, yy + (2 if offset > 0 else -2), x, y + (2.5 if offset > 0 else -2.5))
        c.line(x1 - 2, y, x2 + 2, y)
        for x in (x1, x2):
            c.line(x - 1.8, y - 1.8, x + 1.8, y + 1.8)
        _text(c, (x1 + x2) / 2, y + 1.8, label, size, anchor="middle")
    else:
        x = max(x1, x2) + offset if offset > 0 else min(x1, x2) + offset
        for xx, y in ((x1, y1), (x2, y2)):
            c.line(xx + (2 if offset > 0 else -2), y, x + (2.5 if offset > 0 else -2.5), y)
        c.line(x, y1 - 2, x, y2 + 2)
        for y in (y1, y2):
            c.line(x - 1.8, y - 1.8, x + 1.8, y + 1.8)
        c.saveState(); c.translate(x - 1.8, (y1 + y2) / 2); c.rotate(90)
        _text(c, 0, 0, label, size, anchor="middle"); c.restoreState()


def leader(c, target, text_at, label, size=6.5):
    c.setStrokeColor(INK); c.setLineWidth(0.35); c.setDash()
    c.line(*text_at, *target)
    c.setFillColor(INK); c.circle(*target, 0.9, stroke=0, fill=1)
    anchor = "end" if text_at[0] < target[0] else "start"
    _text(c, text_at[0] + (-1.5 if anchor == "end" else 1.5), text_at[1] - 2, label, size, anchor=anchor)


def scale_bar(c, x, y, scale, units="ft-in"):
    """Graphic scale bar: 0, 1', 2', 4' (or metres) at the exact drawing scale."""
    if units == "ft-in":
        marks = [0, 1, 2, 4]
        unit_mm, lab = FOOT, lambda m: f"{m}'"
    else:
        marks = [0, 1, 2, 5]
        unit_mm, lab = Fraction(1000), lambda m: f"{m} m"
    c.setLineWidth(0.4); c.setStrokeColor(INK)
    for i in range(len(marks) - 1):
        a = float(real_to_paper_pt(marks[i] * unit_mm, scale)); b = float(real_to_paper_pt(marks[i + 1] * unit_mm, scale))
        c.setFillColor(INK if i % 2 == 0 else white)
        c.rect(x + a, y, b - a, 4, stroke=1, fill=1)
    for m in marks:
        _text(c, x + float(real_to_paper_pt(m * unit_mm, scale)), y + 6, lab(m), 6, anchor="middle")
    _text(c, x, y - 8, f"GRAPHIC SCALE  {scale}", 6.5, "Helvetica-Bold")


def check_square(c, x, y, metric=False):
    side = float(PT_PER_MM * 25) if metric else 72.0  # 25 mm or exactly 1 inch
    c.setLineWidth(0.5); c.setStrokeColor(INK); c.setDash()
    c.rect(x, y, side, side, stroke=1, fill=0)
    _text(c, x + side / 2, y + side / 2 - 2, "25 mm" if metric else "1 in", 7, "Helvetica-Bold", anchor="middle")
    _text(c, x + side + 4, y + side - 8, "CHECK SQUARE", 6.5, "Helvetica-Bold")
    _text(c, x + side + 4, y + side - 17, "Measure after printing:", 6)
    _text(c, x + side + 4, y + side - 25, "it must be exactly " + ("25 mm." if metric else "1 inch."), 6)


def north_arrow(c, x, y):
    c.setStrokeColor(INK); c.setFillColor(INK); c.setLineWidth(0.5)
    p = c.beginPath(); p.moveTo(x, y + 14); p.lineTo(x - 5, y - 2); p.lineTo(x, y + 2); p.close()
    c.drawPath(p, stroke=1, fill=1)
    p = c.beginPath(); p.moveTo(x, y + 14); p.lineTo(x + 5, y - 2); p.lineTo(x, y + 2); p.close()
    c.setFillColor(white); c.drawPath(p, stroke=1, fill=1)
    _text(c, x, y - 10, "N", 7, "Helvetica-Bold", anchor="middle")


def title_block(c, x, y, w, h, model, opts):
    p = model.spec.get("project", {})
    c.setStrokeColor(INK); c.setLineWidth(0.8); c.rect(x, y, w, h)
    rows = [("PROJECT", p.get("name", "")), ("CLIENT", p.get("client", "")), ("SHEET TITLE", opts.sheet_title),
            ("DRAWN BY", p.get("drawnBy", "Vivid Build Studio")), ("DATE", opts.date), ("REVISION", p.get("revision", "-")),
            ("SCALE", opts.scale), ("SHEET", opts.sheet_number)]
    rh = h / (len(rows) + 1)
    c.setFillColor(INK); c.setFont("Helvetica-Bold", 9)
    c.drawString(x + 6, y + h - rh + 12, "VIVID ENGINE SOLUTIONS")
    c.setFont("Helvetica", 5.5); c.drawString(x + 6, y + h - rh + 4, "Vivid Build Studio drafting")
    for i, (k, v) in enumerate(rows):
        yy = y + h - rh * (i + 2)
        c.setLineWidth(0.4); c.line(x, yy + rh, x + w, yy + rh)
        _text(c, x + 5, yy + rh - 8, k, 5.5, "Helvetica-Bold", color=GREY)
        _text(c, x + 5, yy + 4, str(v)[:44], 8 if k in ("SHEET", "SCALE") else 7.2, "Helvetica-Bold" if k == "SHEET" else "Helvetica")


def revision_table(c, x, y, w, model):
    p = model.spec.get("project", {})
    rows = [("REV", "DATE", "DESCRIPTION"), (p.get("revision", "A"), _dt.date.today().strftime("%m/%d/%y"), "Issued for review")]
    rh = 11
    c.setStrokeColor(INK); c.setLineWidth(0.5); c.rect(x, y, w, rh * len(rows))
    cols = [x, x + 22, x + 66]
    for i, r in enumerate(rows):
        yy = y + rh * (len(rows) - 1 - i)
        if i: c.line(x, yy + rh, x + w, yy + rh)
        for cx, val in zip(cols, r):
            _text(c, cx + 3, yy + 3.5, val, 5.8, "Helvetica-Bold" if i == 0 else "Helvetica")
    for cx in cols[1:]:
        c.line(cx, y, cx, y + rh * len(rows))


def member_table(c, x, y, model, max_rows=9):
    groups = Counter()
    for e in model.elements:
        if e.type == "fastener":
            continue
        groups[(e.nominal or e.type, e.length, e.name)] += 1
    rows = sorted(groups.items(), key=lambda kv: (kv[0][2], -kv[0][1]))[:max_rows]
    _text(c, x, y, "MEMBER SCHEDULE (PRELIMINARY)", 6.5, "Helvetica-Bold")
    yy = y - 10
    for (nominal, length, name), n in rows:
        _text(c, x, yy, f"{n}", 6.2, anchor="start")
        _text(c, x + 14, yy, f"{nominal}", 6.2)
        _text(c, x + 58, yy, format_length(length), 6.2)
        _text(c, x + 98, yy, name[:22], 6.2)
        yy -= 8.5
    return yy


# ---------- sheet ----------
def render_sheet(model, opts: SheetOptions | None = None) -> bytes:
    """Framing plan + front and right elevations on one sheet, exactly to scale."""
    opts = opts or SheetOptions()
    W, H = paper_size_pt(opts.paper, opts.orientation)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(float(W), float(H)), pageCompression=0)
    c.setTitle(f"{model.spec['project']['name']} - {opts.sheet_number}")
    c.setAuthor("Vivid Engine Solutions - Vivid Build Studio")
    c.setSubject(f"Scale {opts.scale}. {PRINT_NOTE}")
    W, H = float(W), float(H)
    m = 36.0  # 1/2 in margin
    c.setStrokeColor(INK); c.setLineWidth(1.2); c.rect(m, m, W - 2 * m, H - 2 * m)

    # Banner across the top
    c.setFillColor(Color(1, 0.94, 0.94)); c.setStrokeColor(RED); c.setLineWidth(0.8)
    c.rect(m + 6, H - m - 22, W - 2 * m - 12, 16, stroke=1, fill=1)
    _text(c, W / 2, H - m - 17, BANNER, 6.6, "Helvetica-Bold", anchor="middle", color=RED)

    # Title block strip on the right
    tb_w = 2.45 * 72
    tb_x = W - m - tb_w - 6
    title_block(c, tb_x, m + 6, tb_w, 2.6 * 72, model, opts)
    revision_table(c, tb_x, m + 6 + 2.6 * 72 + 8, tb_w, model)

    mat_color = {k: v.get("color") for k, v in model.spec.get("materials", {}).items()}
    def fill_of(e):
        hexc = mat_color.get(e.material or "")
        if not hexc:
            return white
        r, g, b = (int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5))
        return Color(1 - (1 - r) * 0.28, 1 - (1 - g) * 0.28, 1 - (1 - b) * 0.28)  # light tint keeps it printable

    surface = {"surface"}
    # Framing plan (decking removed), top-left
    plan = View(c, model, "plan", opts.scale, (0, 0), exclude_assemblies=surface, hidden=opts.hidden_lines, fill_of=fill_of)
    px, py = m + 64, H - m - 44 - float(plan.height_pt)
    plan.ox, plan.oy = Fraction(px), Fraction(py)
    plan.draw()
    _text(c, px, py - 34, "FRAMING PLAN", 9, "Helvetica-Bold")
    _text(c, px, py - 44, f"SCALE: {opts.scale}   (DECKING NOT SHOWN, HIDDEN MEMBERS DASHED)", 6)
    north_arrow(c, px + float(plan.width_pt) + 56, py + float(plan.height_pt) - 16)

    P = model.params
    B = model.bounds
    def pp(view, x, y):  # world point (x,y) in plan
        return view.pt(x, y)
    # Plan dimensions
    dimension(c, pp(plan, B.lo[0], B.hi[1]), pp(plan, B.hi[0], B.hi[1]), 16, format_length(B.hi[0] - B.lo[0]))
    dimension(c, pp(plan, B.lo[0], B.lo[1]), pp(plan, B.lo[0], B.hi[1]), -18, format_length(B.hi[1] - B.lo[1]), horizontal=False)
    if "beam_y" in P:
        dimension(c, pp(plan, B.hi[0], B.lo[1]), pp(plan, B.hi[0], P["beam_y"]), 16, format_length(P["beam_y"]), horizontal=False)
    # Joist spacing chain over the first three bays
    joists = sorted([e for e in model.elements if e.source == "joist"], key=lambda e: e.solid.base.lo[0])
    if len(joists) >= 3:
        for a, b in zip(joists[:3], joists[1:3]):
            dimension(c, pp(plan, a.solid.base.lo[0], B.hi[1]), pp(plan, b.solid.base.lo[0], B.hi[1]), 6, format_length(b.solid.base.lo[0] - a.solid.base.lo[0], 'in'), size=5.5)
    # Callouts
    def first(src):
        return next((e for e in model.elements if e.source == src or e.id == src), None)
    callouts = []
    j = joists[len(joists) // 2] if joists else None
    if j:
        callouts.append((j, 0.45, f"{j.nominal} JOISTS @ {format_length(P.get('joist_spacing', 0), 'in')} O.C."))
    for src, frac, txt in (("beam", 0.82, None), ("ledger", 0.25, None), ("rim-front", 0.62, None)):
        e = first(src)
        if e:
            callouts.append((e, frac, (txt or f"{e.nominal} {e.name.split(' (')[0].upper()}")))
    post = first("post")
    for e, frac, txt in callouts:
        b = e.solid.base
        tx = b.lo[0] + (b.hi[0] - b.lo[0]) * Fraction(frac).limit_denominator(100)
        ty = (b.lo[1] + b.hi[1]) / 2
        x, y = pp(plan, tx, ty)
        leader(c, (x, y), (px + float(plan.width_pt) + 22, y + 4), txt)
    if post:
        n_posts = sum(1 for e in model.elements if e.source == "post")
        b = post.solid.base
        x, y = pp(plan, (b.lo[0] + b.hi[0]) / 2, (b.lo[1] + b.hi[1]) / 2)
        leader(c, (x, y), (px - 26, y - 14), f"({n_posts}) {post.nominal} POSTS")
    # House line
    _text(c, px + float(plan.width_pt) / 2, py - 12, "EXISTING HOUSE (LEDGER SIDE)", 6, "Helvetica-Bold", anchor="middle", color=GREY)
    c.setStrokeColor(GREY); c.setLineWidth(1.6); c.line(px - 6, py - 4, px + float(plan.width_pt) + 6, py - 4)

    # Front elevation under the plan
    front = View(c, model, "front", opts.scale, (0, 0), fill_of=fill_of)
    fx, fy = px, py - 92 - float(front.height_pt)
    front.ox, front.oy = Fraction(fx), Fraction(fy)
    front.draw()
    c.setStrokeColor(INK); c.setLineWidth(1); c.line(fx - 10, fy, fx + float(front.width_pt) + 10, fy)  # grade
    _text(c, fx + float(front.width_pt) + 12, fy - 2, "GRADE", 5.5, color=GREY)
    dimension(c, front.pt(B.lo[0], 0), front.pt(B.lo[0], B.hi[2]), -16, format_length(B.hi[2]), horizontal=False)
    posts = sorted([e for e in model.elements if e.source == "post"], key=lambda e: e.solid.base.lo[0])
    for a, b in zip(posts, posts[1:]):
        ca = (a.solid.base.lo[0] + a.solid.base.hi[0]) / 2; cb = (b.solid.base.lo[0] + b.solid.base.hi[0]) / 2
        dimension(c, front.pt(ca, 0), front.pt(cb, 0), -12, format_length(cb - ca), size=5.5)
    _text(c, fx, fy - 34, "FRONT ELEVATION", 9, "Helvetica-Bold")
    _text(c, fx, fy - 44, f"SCALE: {opts.scale}", 6)

    # Right elevation beside the front elevation
    right = View(c, model, "right", opts.scale, (0, 0), fill_of=fill_of)
    rx = fx + float(front.width_pt) + 58
    right.ox, right.oy = Fraction(rx), Fraction(fy)
    if rx + float(right.width_pt) < tb_x - 10:
        right.draw()
        c.setStrokeColor(INK); c.setLineWidth(1); c.line(rx - 10, fy, rx + float(right.width_pt) + 10, fy)
        dimension(c, right.pt(B.lo[1], 0), right.pt(B.hi[1], 0), -12, format_length(B.hi[1] - B.lo[1]), size=5.5)
        _text(c, rx, fy - 34, "RIGHT ELEVATION", 9, "Helvetica-Bold")
        _text(c, rx, fy - 44, f"SCALE: {opts.scale}", 6)

    # Member schedule above the revision table
    n_rows = min(9, len({(e.nominal or e.type, e.length, e.name) for e in model.elements if e.type != "fastener"}))
    member_table(c, tb_x, m + 6 + 2.6 * 72 + 8 + 22 + 16 + n_rows * 8.5, model)
    # Notes, scale bar and check square along the bottom-left
    nx, ny = m + 14, m + 70
    scale_bar(c, nx, ny + 18, opts.scale, "ft-in" if model.spec.get("project", {}).get("display", {}).get("units", "ft-in") in ("ft-in", "in") else "m")
    check_square(c, nx + 300, m + 14)
    notes = [PRINT_NOTE, "Dimensions in feet-inches; verify in the field before cutting.",
             "Structural sizes are preliminary estimates, not engineering. Not code-reviewed.",
             f"Generated {opts.date} from Model Spec rev {model.spec.get('project', {}).get('revision', '-')}."]
    for i, n in enumerate(notes):
        _text(c, nx, m + 52 - i * 9, n, 6.2, "Helvetica-Bold" if i == 0 else "Helvetica", color=RED if i == 0 else INK)

    c.showPage(); c.save()
    return buf.getvalue()


def render_scale_test(scale: str = '1/4"=1\'-0"', length_mm: Fraction = 10 * FOOT, paper="ANSI-A") -> bytes:
    """A sheet with one horizontal line of a known real length, for the automated scale test."""
    W, H = paper_size_pt(paper, "landscape")
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(float(W), float(H)), pageCompression=0)
    L = float(real_to_paper_pt(length_mm, scale))
    c.setLineWidth(0.5); c.line(100, 300, 100 + L, 300)
    _text(c, 100, 310, f"{format_length(length_mm)} at {scale}", 8)
    c.showPage(); c.save()
    return buf.getvalue()
