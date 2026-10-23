// Plan measurement math. Points are in PDF points (1/72 in on the printed sheet); results are in feet.
export type Pt = [number, number];
export const PT_PER_IN = 72;

// '1/8"=1\'-0"' -> real feet per PDF point. Also accepts 1"=20' (engineering) and 1:100 (metric ratio, in feet).
export function parseScale(text: string): number {
  const s = text.replace(/\s+/g, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const arch = s.match(/^(\d+(?:\/\d+)?|\d+-\d+\/\d+)"=1'(?:-0")?$/);
  if (arch) { const inches = frac(arch[1]); return 1 / (inches * PT_PER_IN); }      // 1 ft real per `inches` on paper
  const eng = s.match(/^1"=(\d+(?:\.\d+)?)'$/);
  if (eng) return Number(eng[1]) / PT_PER_IN;
  const ratio = s.match(/^1:(\d+(?:\.\d+)?)$/);
  if (ratio) return Number(ratio[1]) / (12 * PT_PER_IN);
  throw new Error(`Can't read the scale "${text}". Use a form like 1/4"=1'-0", 1"=20' or 1:100.`);
}
function frac(t: string): number {
  const m = t.match(/^(\d+)-(\d+)\/(\d+)$/); if (m) return +m[1] + +m[2] / +m[3];
  const f = t.match(/^(\d+)\/(\d+)$/); if (f) return +f[1] / +f[2];
  return Number(t);
}

export const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// Two clicks on a known dimension. Returns the calibrated scale and how far it is from the printed one.
export function calibrate(a: Pt, b: Pt, knownFt: number, printedFtPerPt?: number) {
  const pts = dist(a, b);
  if (pts < 1) throw new Error('Pick two points farther apart.');
  if (!(knownFt > 0)) throw new Error('Enter the real length of that dimension.');
  const ftPerPt = knownFt / pts;
  const mismatchPct = printedFtPerPt ? Math.abs(ftPerPt - printedFtPerPt) / printedFtPerPt * 100 : null;
  return { ftPerPt, mismatchPct, warn: mismatchPct != null && mismatchPct > 1,
    message: mismatchPct == null ? 'Calibrated from your two points.'
      : mismatchPct > 1 ? `The printed scale and your two points disagree by ${mismatchPct.toFixed(1)}%. Check the sheet was printed to scale, or re-pick the points.`
      : `Printed scale confirmed (within ${mismatchPct.toFixed(2)}%).` };
}

export const linearFt = (path: Pt[], ftPerPt: number) => path.slice(1).reduce((s, p, i) => s + dist(path[i], p), 0) * ftPerPt;

const shoelace = (poly: Pt[]) => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
export function areaSf(outline: Pt[], ftPerPt: number, cutouts: Pt[][] = []) {
  if (outline.length < 3) throw new Error('An area needs at least three points.');
  const k = ftPerPt * ftPerPt;
  return Math.max(0, shoelace(outline) - cutouts.reduce((s, c) => s + shoelace(c), 0)) * k;
}
export const volumeCy = (areaSqFt: number, depthIn: number) => areaSqFt * (depthIn / 12) / 27;
// Roof: plan area × pitch factor, pitch as rise per 12.
export const roofAreaSf = (planSf: number, risePer12: number) => planSf * Math.sqrt(1 + (risePer12 / 12) ** 2);
export const wallAreaSf = (lengthFt: number, heightFt: number, openingsSf = 0) => Math.max(0, lengthFt * heightFt - openingsSf);

// Fence posts along a run: a post at every corner and end, plus line posts so no bay exceeds the spacing.
// Gates add one extra post each (a gate needs a post on both sides).
export function fencePosts(path: Pt[], ftPerPt: number, maxSpacingFt: number, gates = 0, closed = false) {
  const segs = path.slice(1).map((p, i) => dist(path[i], p) * ftPerPt);
  if (closed) segs.push(dist(path[path.length - 1], path[0]) * ftPerPt);
  const terminals = closed ? segs.length : segs.length + 1;               // ends + corners
  const linePosts = segs.reduce((s, L) => s + Math.max(0, Math.ceil(L / maxSpacingFt - 1e-9) - 1), 0);
  const bays = segs.reduce((s, L) => s + Math.ceil(L / maxSpacingFt - 1e-9), 0);
  return { segmentsFt: segs, totalFt: segs.reduce((a, b) => a + b, 0), terminals, linePosts, gatePosts: gates, posts: terminals + linePosts + gates, bays };
}

export const ftIn = (ft: number) => { let i = Math.round(ft * 12); const f = Math.floor(i / 12); i -= f * 12; return `${f}'-${i}"`; };
