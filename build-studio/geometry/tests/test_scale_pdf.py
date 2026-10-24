"""Automated scale tests: what's on the PDF must measure exactly with a ruler."""
import io
from fractions import Fraction
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
EX = HERE.parents[1] / "examples"

import pdfplumber  # noqa: E402  (test-only dependency, MIT)

from vbs import load  # noqa: E402
from vbs.drawing import SheetOptions, real_to_paper_pt, render_scale_test, render_sheet  # noqa: E402
from vbs.units import FOOT, INCH  # noqa: E402


def lines_and_rects(pdf_bytes):
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        page = pdf.pages[0]
        return page.width, page.height, page.lines, page.rects


class ScaleTest(unittest.TestCase):
    def test_ten_feet_at_quarter_inch_is_180_points(self):
        self.assertEqual(real_to_paper_pt(10 * FOOT, '1/4"=1\'-0"'), 180)       # exact math: 2.5 in
        _, _, lines, _ = lines_and_rects(render_scale_test('1/4"=1\'-0"', 10 * FOOT))
        lengths = [abs(l["x1"] - l["x0"]) for l in lines if abs(l["y1"] - l["y0"]) < 0.01]
        self.assertTrue(any(abs(L - 180) <= 0.1 for L in lengths), lengths)

    def test_other_scales(self):
        self.assertEqual(real_to_paper_pt(12 * FOOT, '1/4"=1\'-0"'), 216)      # 3 in
        self.assertEqual(real_to_paper_pt(100 * FOOT, '1"=20\''), 360)          # 5 in
        self.assertEqual(real_to_paper_pt(1000, "1:50"), Fraction(72 * 20 * 10, 254))  # 20 mm exactly

    def test_deck_sheet_is_true_size(self):
        pdf = render_sheet(load(EX / "deck.json"), SheetOptions())
        w, h, lines, rects = lines_and_rects(pdf)
        self.assertEqual((round(w, 3), round(h, 3)), (792, 612))                 # ANSI A landscape, 11 x 8.5 in
        self.assertTrue(any(abs(r["width"] - 72) < 0.01 and abs(r["height"] - 72) < 0.01 for r in rects), "1-inch check square")
        # The framing plan's ledger is 12 ft long: 3 in = 216 pt on paper.
        self.assertTrue(any(abs(r["width"] - 216) <= 0.1 and abs(r["height"] - 1.5 * 72 / 48) <= 0.05 for r in rects), "12 ft member at 216 pt")


if __name__ == "__main__":
    unittest.main()
