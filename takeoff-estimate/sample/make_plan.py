"""Sample plan for the takeoff demo: a backyard fence site plan at 1/8"=1'-0" on a 24x18 sheet (ARCH C).
Every length is drawn to scale: 1 ft = 9 PDF points."""
from reportlab.lib.colors import Color, black
from reportlab.pdfgen import canvas

FT = 9.0                      # 1/8" per foot = 9 pt
W, H = 24 * 72, 18 * 72
X0, Y0 = 200, 100             # fence bottom-left corner
L, D = 80 * FT, 120 * FT      # 80 ft across the back, 120 ft each side

c = canvas.Canvas("sample/backyard-fence-plan.pdf", pagesize=(W, H))
c.setTitle("Sample plan - backyard fence (Vivid Takeoff demo)")
c.setLineWidth(2); c.rect(18, 18, W - 36, H - 36)
grey = Color(0.55, 0.55, 0.55)

# house
c.setLineWidth(1.5); c.setFillColor(Color(0.92, 0.92, 0.92)); c.rect(X0 + 6 * FT, Y0 + D, 68 * FT, 9 * FT, fill=1)
c.setFillColor(black); c.setFont("Helvetica-Bold", 14); c.drawCentredString(X0 + L / 2, Y0 + D + 3.5 * FT, "EXISTING HOUSE")

# property line (dashed, 5 ft outside the fence)
c.setDash(12, 6); c.setStrokeColor(grey); c.setLineWidth(1)
c.rect(X0 - 5 * FT, Y0 - 5 * FT, L + 10 * FT, D + 15 * FT); c.setDash()
c.setFont("Helvetica", 9); c.setFillColor(grey); c.drawString(X0 - 5 * FT + 4, Y0 - 5 * FT + 4, "PROPERTY LINE")

# fence (3 sides) with a 4 ft gate centered on the back run
c.setStrokeColor(black); c.setFillColor(black); c.setLineWidth(2.5)
gx = X0 + L / 2 - 2 * FT
p = c.beginPath(); p.moveTo(X0, Y0 + D); p.lineTo(X0, Y0); p.lineTo(gx, Y0); c.drawPath(p, stroke=1, fill=0)
p = c.beginPath(); p.moveTo(gx + 4 * FT, Y0); p.lineTo(X0 + L, Y0); p.lineTo(X0 + L, Y0 + D); c.drawPath(p, stroke=1, fill=0)
c.setLineWidth(1); c.arc(gx - 4 * FT, Y0 - 4 * FT, gx + 4 * FT, Y0 + 4 * FT, 0, 90); c.line(gx, Y0, gx + 4 * FT, Y0 + 0.01)
c.setFont("Helvetica", 10); c.drawCentredString(gx + 2 * FT, Y0 + 12, "4' GATE")
c.setFont("Helvetica-Bold", 12); c.drawString(X0 + 14, Y0 + D / 2, "6' CEDAR PRIVACY FENCE")

def dim(x1, y1, x2, y2, text, off):
    c.setLineWidth(0.7); vertical = x1 == x2
    if vertical:
        x = x1 - off; c.line(x, y1, x, y2); c.line(x - 6, y1, x + 6, y1); c.line(x - 6, y2, x + 6, y2)
        c.saveState(); c.translate(x - 6, (y1 + y2) / 2); c.rotate(90); c.setFont("Helvetica-Bold", 13); c.drawCentredString(0, 0, text); c.restoreState()
    else:
        y = y1 - off; c.line(x1, y, x2, y); c.line(x1, y - 6, x1, y + 6); c.line(x2, y - 6, x2, y + 6)
        c.setFont("Helvetica-Bold", 13); c.drawCentredString((x1 + x2) / 2, y + 5, text)
dim(X0, Y0, X0, Y0 + D, "120'-0\"", 70)
dim(X0, Y0, X0 + L, Y0, "80'-0\"", 30)

# graphic scale bar (0-40 ft)
sx, sy = 1000, 420
c.setFont("Helvetica", 9)
for i in range(0, 4):
    c.setFillColor(black if i % 2 == 0 else Color(1, 1, 1)); c.rect(sx + i * 10 * FT, sy, 10 * FT, 8, fill=1)
    c.setFillColor(black); c.drawCentredString(sx + i * 10 * FT, sy + 12, f"{i*10}'")
c.drawCentredString(sx + 40 * FT, sy + 12, "40'")
c.drawString(sx, sy - 14, "GRAPHIC SCALE  1/8\" = 1'-0\"")

# north arrow
c.setLineWidth(1.5); c.line(1180, 560, 1180, 640); c.line(1180, 640, 1170, 620); c.line(1180, 640, 1190, 620); c.drawCentredString(1180, 648, "N")

# title block
tx, ty, tw, th = W - 18 - 360, 18, 360, 300
c.setLineWidth(1.5); c.rect(tx, ty, tw, th)
for yy in (ty + 60, ty + 120, ty + 200): c.line(tx, yy, tx + tw, yy)
c.setFont("Helvetica-Bold", 16); c.drawString(tx + 12, ty + th - 30, "SAMPLE PLAN - NOT FOR CONSTRUCTION")
c.setFont("Helvetica", 11); c.drawString(tx + 12, ty + th - 50, "Vivid Takeoff & Estimate demo sheet")
c.drawString(tx + 12, ty + 175, "PROJECT: Backyard fence (sample)")
c.drawString(tx + 12, ty + 158, "DRAWN: Vivid Engine Solutions")
c.drawString(tx + 12, ty + 100, "SHEET TITLE"); c.setFont("Helvetica-Bold", 14); c.drawString(tx + 12, ty + 80, "SITE PLAN - FENCE LAYOUT")
c.setFont("Helvetica", 11); c.drawString(tx + 12, ty + 40, "SCALE"); c.setFont("Helvetica-Bold", 14); c.drawString(tx + 12, ty + 22, "1/8\" = 1'-0\"")
c.setFont("Helvetica", 11); c.drawString(tx + 220, ty + 40, "SHEET"); c.setFont("Helvetica-Bold", 22); c.drawString(tx + 220, ty + 16, "C-101")
c.showPage(); c.save()
