// Lengths in the GC building model are inches (numbers). These helpers format and parse them.
// Display rounds to 1/16"; the stored value is never rounded.

export function ftin(inches, { precision = 16 } = {}) {
  if (!Number.isFinite(inches)) return '—';
  const neg = inches < 0;
  let n = Math.round(Math.abs(inches) * precision);
  const perFt = 12 * precision;
  const ft = Math.floor(n / perFt); n -= ft * perFt;
  const inch = Math.floor(n / precision);
  let f = n % precision, d = precision;
  while (f && f % 2 === 0) { f /= 2; d /= 2; }
  const frac = f ? `${f}/${d}` : '';
  const ins = inch ? (frac ? `${inch} ${frac}` : `${inch}`) : (frac ? (ft ? `0 ${frac}` : frac) : '0');
  return `${neg ? '-' : ''}${ft ? `${ft}'-` : ''}${ins}"`;
}

export const sqft = sqIn => `${(sqIn / 144).toLocaleString('en-US', { maximumFractionDigits: 1 })} sq ft`;

const WORDS = { zero: 0, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, eighteen: 18, twenty: 20, half: 0.5 };

// "2 feet", "two feet", "18 in", "14'", "3' 6\"", "2.5ft", "1 foot 6 inches" -> inches. null when no length found.
export function parseLength(text) {
  if (typeof text !== 'string') return null;
  const t = text.toLowerCase().replace(/[’′]/g, "'").replace(/[”″]/g, '"');
  const num = `(\\d+(?:\\.\\d+)?|${Object.keys(WORDS).join('|')})`;
  const val = s => (s in WORDS ? WORDS[s] : parseFloat(s));
  const ftRe = new RegExp(`${num}\\s*(?:feet|foot|ft|')`);
  const inRe = new RegExp(`${num}\\s*(?:inches|inch|in\\b|")`);
  const f = t.match(ftRe), i = t.match(inRe);
  if (!f && !i) return null;
  let total = 0;
  if (f) total += val(f[1]) * 12;
  if (i) total += val(i[1]);
  return Number.isFinite(total) ? total : null;
}
