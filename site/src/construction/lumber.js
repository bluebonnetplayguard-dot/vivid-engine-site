// Actual dressed sizes (inches) for nominal lumber, and stock-length helpers.
export const SIZES = {
  '1x6': [0.75, 5.5], '2x2': [1.5, 1.5], '2x4': [1.5, 3.5], '2x6': [1.5, 5.5], '2x8': [1.5, 7.25],
  '2x10': [1.5, 9.25], '2x12': [1.5, 11.25], '4x4': [3.5, 3.5], '4x6': [3.5, 5.5], '6x6': [5.5, 5.5],
  '5/4x6': [1, 5.5], 'LVL 1-3/4x11-7/8': [1.75, 11.875],
};
export const thick = n => SIZES[n][0];
export const depth = n => SIZES[n][1];

export const STOCK_FT = [8, 10, 12, 14, 16, 20];

// Smallest stock length that covers a cut, in feet. Cuts longer than 20 ft are spliced
// from several 20 ft pieces (pieces > 1).
export function stockFor(lengthIn) {
  const ft = lengthIn / 12;
  for (const s of STOCK_FT) if (ft <= s + 1e-6) return { ft: s, pieces: 1 };
  return { ft: 20, pieces: Math.ceil(ft / 20) };
}

// Feet-and-inches to the nearest 1/16".
export function ftin(inches) {
  let i = Math.round(Math.abs(inches) * 16);
  const ft = Math.floor(i / 192); i -= ft * 192;
  const inch = Math.floor(i / 16); let f = i % 16, d = 16;
  while (f && f % 2 === 0) { f /= 2; d /= 2; }
  const fr = f ? `${f}/${d}` : '';
  const ins = inch ? (fr ? `${inch}-${fr}` : `${inch}`) : (fr || '0');
  return (inches < 0 ? '-' : '') + (ft ? `${ft}'-` : '') + ins + '"';
}
