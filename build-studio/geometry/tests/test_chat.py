import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from vbs.chat import NeedsPlanner, handle_build  # noqa: E402
from vbs.quickparse import parse  # noqa: E402
from vbs.units import FOOT, INCH  # noqa: E402


class QuickParse(unittest.TestCase):
    def test_common_phrasings(self):
        self.assertEqual(parse("Design a 12x16 deck 30 inches high"), ("deck", {"width": "12ft", "depth": "16ft", "height": "30in"}))
        self.assertEqual(parse("14' x 10' deck, joists at 12 in")[1]["joist_spacing"], "12in")
        self.assertEqual(parse('deck 16 by 12 ft, 2.5 ft off the ground, 24" o.c.')[1], {"width": "16ft", "depth": "12ft", "height": "2.5ft", "joist_spacing": "24in"})
        self.assertIsNone(parse("a pergola 10x10"))


class ChatTurn(unittest.TestCase):
    def test_plain_message_builds_a_checked_model(self):
        r = handle_build("Build me a 16x12 deck 36 inches high")
        self.assertTrue(r["validation"]["ok"], r["validation"]["findings"])
        self.assertEqual(r["viewer"]["bounds"][1][2], float(36 * INCH))
        self.assertIn("13 joists", r["summary"])
        self.assertTrue(r["notice"].startswith("Not for construction"))
        json.dumps(r)  # the whole response must be JSON-serializable for the API

    def test_follow_up_shows_before_and_after(self):
        first = handle_build("12x10 deck")
        second = handle_build(template="deck", params={"width": "16ft", "depth": "10ft"}, previous_spec=first["spec"])
        self.assertIn("3 joists added", second["changes"])
        self.assertTrue(any("Beam lengthened" in c for c in second["changes"]))

    def test_unreadable_request_goes_to_the_planner(self):
        with self.assertRaises(NeedsPlanner):
            handle_build("design a treehouse with a rope bridge")

    def test_full_spec_from_the_planner(self):
        spec = json.loads((HERE.parents[1] / "examples" / "half-lap-crossing.json").read_text())
        r = handle_build(spec=spec)
        self.assertTrue(r["validation"]["ok"])
        self.assertEqual(r["changes"][0][:9], "New model")


if __name__ == "__main__":
    unittest.main()


class ReviewRegressions(unittest.TestCase):
    def test_follow_up_keeps_unmentioned_sizes(self):
        a = handle_build("12x16 deck 30 inches high joists 12 in o.c.")
        b = handle_build(template="deck", params={"width": "14ft"}, previous_spec=a["spec"])
        self.assertEqual(b["spec"]["parameters"]["joist_spacing"], "12in")
        self.assertEqual(b["spec"]["parameters"]["deck_height"], "30in")

    def test_quick_parser_wording(self):
        from vbs.quickparse import parse
        self.assertEqual(parse("build a deck 12x16 in my backyard")[1]["width"], "12ft")
        self.assertEqual(parse("deck with 2x10 joists, 12 by 16")[1]["depth"], "16ft")
        self.assertEqual(parse("12x16 deck 2ft 6in high")[1]["height"], "2ft6in")
        self.assertIsNone(parse("I want a deck"))
        self.assertIsNone(parse("12x16 deck with stairs"))
