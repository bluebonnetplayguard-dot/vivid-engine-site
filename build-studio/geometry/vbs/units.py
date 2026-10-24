"""Exact lengths. Every length is a fractions.Fraction of millimetres; floats appear only for display."""
from __future__ import annotations

import math
import re
from fractions import Fraction

MM_PER = {
    "mm": Fraction(1),
    "cm": Fraction(10),
    "m": Fraction(1000),
    "in": Fraction(127, 5),        # 25.4 mm exactly
    "ft": Fraction(127 * 12, 5),   # 304.8 mm exactly
}
INCH = MM_PER["in"]
FOOT = MM_PER["ft"]

# 12ft | 16in | 1-1/2in | 3/4in | 38mm | 2.5m | 2ft 6in | 2' 6" | 7-1/4"
_NUM = r"(?:\d+(?:\.\d+)?)(?:-\d+/\d+)?|\d+/\d+"
_TOKEN = re.compile(rf"\s*({_NUM})\s*(ft|in|mm|cm|m|'|\")", re.I)


def _num(s: str) -> Fraction:
    if "-" in s and "/" in s:              # 1-1/2
        whole, frac = s.split("-", 1)
        n, d = frac.split("/")
        return Fraction(whole) + Fraction(int(n), int(d))
    if "/" in s:
        n, d = s.split("/")
        return Fraction(int(n), int(d))
    return Fraction(s)


def parse_length(text: str) -> Fraction | None:
    """Parse a length literal with units into exact mm. Returns None if text isn't a pure length literal."""
    s = text.strip()
    pos, total, found = 0, Fraction(0), False
    while pos < len(s):
        m = _TOKEN.match(s, pos)
        if not m:
            return None
        unit = {"'": "ft", '"': "in"}.get(m.group(2), m.group(2).lower())
        total += _num(m.group(1)) * MM_PER[unit]
        pos, found = m.end(), True
    return total if found else None


def to_unit(mm: Fraction, unit: str) -> Fraction:
    return Fraction(mm) / MM_PER[unit]


def format_length(mm: Fraction, units: str = "ft-in", fraction: int = 16) -> str:
    """Display a length, rounding only here. ft-in uses fractions down to 1/fraction inch."""
    mm = Fraction(mm)
    if units in ("mm", "cm", "m"):
        v = float(mm / MM_PER[units])
        return f"{v:.{0 if units == 'mm' else 1 if units == 'cm' else 3}f} {units}"
    inches = mm / INCH
    sign = "-" if inches < 0 else ""
    inches = abs(inches)
    steps = round(inches * fraction)               # nearest 1/fraction inch
    whole_in, rem = divmod(steps, fraction)
    frac = Fraction(rem, fraction)
    frac_txt = f"{frac.numerator}/{frac.denominator}" if frac else ""
    if units == "in":
        txt = f"{whole_in}" + (f"-{frac_txt}" if frac_txt and whole_in else frac_txt if frac_txt else "")
        return f'{sign}{txt or 0}"'
    ft, inch = divmod(whole_in, 12)
    in_txt = f"{inch}" + (f"-{frac_txt}" if frac_txt else "") if (inch or not frac_txt) else frac_txt
    if ft:
        return f"{sign}{ft}'-{in_txt}\""
    return f'{sign}{in_txt}"'


def floor_div(a: Fraction, b: Fraction) -> int:
    return math.floor(Fraction(a) / Fraction(b))
