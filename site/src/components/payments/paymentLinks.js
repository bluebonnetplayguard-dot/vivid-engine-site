export const SQUARE_PAY_URL = 'https://square.link/u/bCu9umM4';
export const HEARTH_FINANCING_URL = 'https://app.gethearth.com/flyers/bluebonnet-playguard-llc/brennan';

export function withSource(url, source) {
  const result = new URL(url);
  result.searchParams.set('src', source);
  return result.toString();
}