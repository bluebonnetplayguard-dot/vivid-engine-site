// Input helpers ported from base44/shared/guards.ts.

export function str(value: unknown, max = 1000): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
}

export const isEmail = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

// "+1XXXXXXXXXX" for a valid US number, else ''.
export function normalizeUsPhone(value: unknown): string {
  const digits = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  const local = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(local) ? `+1${local}` : '';
}

// Ten-digit form used in stored inquiries.
export function normPhone(value: unknown): string {
  const d = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  const n = d.length === 11 && d[0] === '1' ? d.slice(1) : d;
  return n.length === 10 ? n : '';
}
