"""Safe evaluation of parameter expressions with exact rational arithmetic.

Lengths ("16in", "1-1/2in") become Fractions of mm; bare numbers stay dimensionless Fractions.
Only arithmetic, parameter names and a few functions are allowed: no attribute access, no calls
to anything else, no imports.
"""
from __future__ import annotations

import ast
import math
import re
from fractions import Fraction

from .units import parse_length, _TOKEN

FUNCS = {
    "floor": lambda x: Fraction(math.floor(x)),
    "ceil": lambda x: Fraction(math.ceil(x)),
    "round": lambda x: Fraction(round(x)),
    "min": lambda *a: min(a),
    "max": lambda *a: max(a),
    "abs": lambda x: abs(x),
}


class ExprError(ValueError):
    pass


_LITERAL = re.compile(r"(?<![\w.])((?:\d+(?:\.\d+)?)(?:-\d+/\d+)?|\d+/\d+)\s*(ft|in|mm|cm|m|'|\")(?![\w])", re.I)


def _replace_lengths(text: str, table: dict) -> str:
    """Swap every length literal for a placeholder name so Python's parser sees plain identifiers."""
    def repl(m: re.Match) -> str:
        # Join compound literals like "2ft 6in" by parsing greedily from this match.
        key = f"__len{len(table)}"
        table[key] = parse_length(m.group(0))
        return key
    out = _LITERAL.sub(repl, text)
    # Collapse "__lenA __lenB" (e.g. 2ft 6in) into a sum.
    return re.sub(r"(__len\d+)\s+(?=__len\d+)", r"\1 + ", out)


def evaluate(expr, names: dict) -> Fraction:
    if isinstance(expr, (int, float)):
        return Fraction(str(expr))
    if not isinstance(expr, str):
        raise ExprError(f"Unsupported expression: {expr!r}")
    direct = parse_length(expr)
    if direct is not None:
        return direct
    lit: dict = {}
    src = _replace_lengths(expr, lit)
    try:
        tree = ast.parse(src, mode="eval")
    except SyntaxError as e:
        raise ExprError(f"Can't read expression {expr!r}: {e.msg}") from None
    env = {**names, **lit}
    return _eval(tree.body, env, expr)


def _eval(node, env, original):
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return Fraction(str(node.value))
    if isinstance(node, ast.Name):
        if node.id not in env:
            raise ExprError(f"Unknown name {node.id!r} in {original!r}")
        return env[node.id]
    if isinstance(node, ast.BinOp):
        a, b = _eval(node.left, env, original), _eval(node.right, env, original)
        if isinstance(node.op, ast.Add): return a + b
        if isinstance(node.op, ast.Sub): return a - b
        if isinstance(node.op, ast.Mult): return a * b
        if isinstance(node.op, ast.Div):
            if b == 0: raise ExprError(f"Division by zero in {original!r}")
            return a / b
        if isinstance(node.op, ast.FloorDiv): return Fraction(math.floor(a / b))
        raise ExprError(f"Operator not allowed in {original!r}")
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
        v = _eval(node.operand, env, original)
        return -v if isinstance(node.op, ast.USub) else v
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in FUNCS and not node.keywords:
        return FUNCS[node.func.id](*[_eval(a, env, original) for a in node.args])
    raise ExprError(f"Not allowed in an expression: {ast.dump(node)[:60]} ({original!r})")


def resolve_parameters(params: dict) -> dict:
    """Evaluate parameters in order; each may use the ones before it."""
    out: dict = {}
    for name, value in (params or {}).items():
        out[name] = evaluate(value, out)
    return out
