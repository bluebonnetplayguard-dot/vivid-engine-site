import copy
import json
import sys
import unittest
from fractions import Fraction
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
EX = HERE.parents[1] / "examples"

from vbs import build, load, with_parameter  # noqa: E402
from vbs import validate  # noqa: E402
from vbs.expr import ExprError, evaluate, resolve_parameters  # noqa: E402
from vbs.units import FOOT, INCH, format_length, parse_length  # noqa: E402


class Units(unittest.TestCase):
    def test_exact_parsing(self):
        self.assertEqual(parse_length("1in"), Fraction(127, 5))
        self.assertEqual(parse_length("1-1/2in"), Fraction(381, 10))
        self.assertEqual(parse_length("2ft 6in"), 30 * INCH)
        self.assertEqual(parse_length("2' 6\""), 30 * INCH)
        self.assertEqual(parse_length("38mm"), 38)
        self.assertEqual(parse_length("1/32in"), INCH / 32)  # exact, no float error

    def test_display_rounds_only_at_the_end(self):
        self.assertEqual(format_length(12 * FOOT), "12'-0\"")
        self.assertEqual(format_length(Fraction(381, 10)), '1-1/2"')
        self.assertEqual(format_length(10 * FOOT - 3 * INCH), "9'-9\"")
        self.assertEqual(format_length(16 * INCH, "in"), '16"')
        self.assertEqual(format_length(Fraction(1000), "mm"), "1000 mm")


class Expressions(unittest.TestCase):
    def test_parameters_and_floor(self):
        p = resolve_parameters({"deck_width": "12ft", "joist_spacing": "16in", "joist_count": "floor(deck_width / joist_spacing) + 1"})
        self.assertEqual(p["joist_count"], 10)

    def test_no_code_execution(self):
        for bad in ["__import__('os')", "open('x')", "deck.__class__", "lambda: 1"]:
            with self.assertRaises(ExprError):
                evaluate(bad, {"deck": Fraction(1)})


class DeckModel(unittest.TestCase):
    def setUp(self):
        self.m = load(EX / "deck.json")

    def test_counts_and_sizes(self):
        joists = [e for e in self.m.elements if e.source == "joist"]
        self.assertEqual(len(joists), 10)
        self.assertEqual(joists[-1].solid.base.lo[0], 12 * FOOT - Fraction(3, 2) * INCH)   # last joist flush with the end
        self.assertEqual(len([e for e in self.m.elements if e.source == "post"]), 3)
        self.assertEqual(self.m.bounds.hi[2], 30 * INCH)                                    # deck surface at 30"

    def test_no_clashes_or_defects(self):
        r = validate.run(self.m)
        self.assertTrue(r.ok, [f.message for f in r.findings])

    def test_changing_a_parameter_rebuilds_dependents(self):
        wider = build(with_parameter(self.m.spec, "deck_width", "16ft"))
        self.assertEqual(len([e for e in wider.elements if e.source == "joist"]), 13)
        self.assertEqual(wider.by_id("beam").length, 16 * FOOT)

    def test_implausible_units_are_flagged(self):
        bad = build(with_parameter(self.m.spec, "deck_width", "120m"))
        self.assertTrue(any(f.fault == "unit-sanity" for f in validate.run(bad, check_collisions=False).findings))


class HalfLapAndDrilling(unittest.TestCase):
    def setUp(self):
        self.spec = json.loads((EX / "half-lap-crossing.json").read_text())

    def test_clash_without_joint_suggests_half_lap(self):
        s = copy.deepcopy(self.spec); s["joints"] = []; s["operations"] = []
        found = [f for f in validate.run(build(s)).findings if f.fault == "collision"]
        self.assertEqual(len(found), 1)
        self.assertIn("half-lap", found[0].suggestion.lower())

    def test_half_lap_makes_faces_flush_and_removes_half_each(self):
        m = build(self.spec)
        a, b = m.by_id("beam-a"), m.by_id("beam-b")
        region = a.solid.base.intersect(b.solid.base)
        self.assertEqual(a.solid.base.volume - a.solid.volume, region.volume / 2)
        self.assertEqual(b.solid.base.volume - b.solid.volume, region.volume / 2)
        self.assertEqual(a.solid.base.lo[2], b.solid.base.lo[2])     # same plane: tops and bottoms flush
        self.assertTrue(validate.run(m).ok)

    def test_through_hole_drills_both_members(self):
        m = build(self.spec)
        for eid in ("beam-a", "beam-b"):
            holes = m.by_id(eid).solid.holes
            self.assertEqual(len(holes), 1)
            self.assertEqual(holes[0].diameter, INCH / 2)
        self.assertIsNotNone(m.by_id("beam-a").solid.holes[0].countersink)

    def test_edge_distance_check(self):
        s = copy.deepcopy(self.spec)
        s["operations"][0]["at"] = ["member_length / 2", "member_length / 2 - size / 2 + 1/4in", "size"]
        found = [f for f in validate.run(build(s)).findings if f.fault == "tolerance"]
        self.assertTrue(found)


class Wall(unittest.TestCase):
    def test_buildup_layers_in_order(self):
        m = load(EX / "ventilated-wall.json")
        sheets = [e for e in m.elements if e.type == "sheet"]
        self.assertEqual([e.name for e in sheets], ["Cladding", "Weather barrier", "Sheathing", "Interior board"])
        total = max(e.solid.base.hi[1] for e in m.elements)
        self.assertEqual(total, parse_length("5/16in") + parse_length("3/4in") + parse_length("1/32in") + parse_length("7/16in") + parse_length("3-1/2in") + parse_length("1/2in"))
        self.assertTrue(validate.run(m).ok)


if __name__ == "__main__":
    unittest.main()
