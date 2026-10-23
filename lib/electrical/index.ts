// Vivid Electrical: calculation library. Every formula is implemented from first principles
// (Ohm's law, power, geometry, trigonometry); nothing is copied from a published reference.
// NEC table values (ampacity, conduit fill, derating, grounding) are never pre-filled: callers pass
// values from the user's own code book via a company table.
// Each result carries the value, its unit, and the working, step by step, for display.

export const DISCLAIMER = 'Calculation aid only. Verify against the NEC edition adopted by your jurisdiction. Electrical work must be performed by a licensed electrician.';
export const LICENSED_REFERENCE_PACK = (typeof process !== 'undefined' && process.env?.LICENSED_REFERENCE_PACK === 'true');

export interface Step { label: string; formula: string; work: string; result: string }
export interface Result<T = number> { value: T; unit: string; steps: Step[]; notes: string[]; disclaimer: string }

// ---------- formatting ----------
/** Round to n significant figures for display (math stays full precision). */
export function sig(x: number, n = 4): string {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return '0';
  const s = Number(x.toPrecision(n));
  return Math.abs(s) >= 1e6 || Math.abs(s) < 1e-4 ? s.toExponential(n - 1) : String(s);
}
const rad = (deg: number) => (deg * Math.PI) / 180;
/** Inches as a fraction to the nearest 1/16 (display only). */
export function inchFraction(inches: number, denom = 16): string {
  const neg = inches < 0; let steps = Math.round(Math.abs(inches) * denom);
  const whole = Math.floor(steps / denom); let num = steps % denom, d = denom;
  while (num && num % 2 === 0) { num /= 2; d /= 2; }
  const frac = num ? `${num}/${d}` : '';
  return `${neg ? '-' : ''}${whole ? whole : ''}${whole && frac ? '-' : ''}${frac || (whole ? '' : '0')}"`;
}
const result = <T>(value: T, unit: string, steps: Step[], notes: string[] = []): Result<T> => ({ value, unit, steps, notes, disclaimer: DISCLAIMER });

// ---------- Ohm's law and power ----------
export type OhmInput = { V?: number; I?: number; R?: number; P?: number };
/** Give any two of V (volts), I (amps), R (ohms), P (watts); returns all four with the working. */
export function ohmsLaw(input: OhmInput): Result<Required<OhmInput>> {
  const known = (['V', 'I', 'R', 'P'] as const).filter(k => input[k] !== undefined && input[k] !== null);
  if (known.length !== 2) throw new Error('Enter exactly two of voltage, current, resistance and power.');
  let { V, I, R, P } = input as Required<OhmInput>;
  const steps: Step[] = [];
  const has = (a: string, b: string) => known.includes(a as never) && known.includes(b as never);
  if (has('V', 'I')) { R = V / I; P = V * I; steps.push({ label: 'Resistance', formula: 'R = V / I', work: `${sig(V)} / ${sig(I)}`, result: `${sig(R)} Ω` }, { label: 'Power', formula: 'P = V · I', work: `${sig(V)} × ${sig(I)}`, result: `${sig(P)} W` }); }
  else if (has('V', 'R')) { I = V / R; P = (V * V) / R; steps.push({ label: 'Current', formula: 'I = V / R', work: `${sig(V)} / ${sig(R)}`, result: `${sig(I)} A` }, { label: 'Power', formula: 'P = V² / R', work: `${sig(V)}² / ${sig(R)}`, result: `${sig(P)} W` }); }
  else if (has('V', 'P')) { I = P / V; R = (V * V) / P; steps.push({ label: 'Current', formula: 'I = P / V', work: `${sig(P)} / ${sig(V)}`, result: `${sig(I)} A` }, { label: 'Resistance', formula: 'R = V² / P', work: `${sig(V)}² / ${sig(P)}`, result: `${sig(R)} Ω` }); }
  else if (has('I', 'R')) { V = I * R; P = I * I * R; steps.push({ label: 'Voltage', formula: 'V = I · R', work: `${sig(I)} × ${sig(R)}`, result: `${sig(V)} V` }, { label: 'Power', formula: 'P = I² · R', work: `${sig(I)}² × ${sig(R)}`, result: `${sig(P)} W` }); }
  else if (has('I', 'P')) { V = P / I; R = P / (I * I); steps.push({ label: 'Voltage', formula: 'V = P / I', work: `${sig(P)} / ${sig(I)}`, result: `${sig(V)} V` }, { label: 'Resistance', formula: 'R = P / I²', work: `${sig(P)} / ${sig(I)}²`, result: `${sig(R)} Ω` }); }
  else { V = Math.sqrt(P * R); I = Math.sqrt(P / R); steps.push({ label: 'Voltage', formula: 'V = √(P · R)', work: `√(${sig(P)} × ${sig(R)})`, result: `${sig(V)} V` }, { label: 'Current', formula: 'I = √(P / R)', work: `√(${sig(P)} / ${sig(R)})`, result: `${sig(I)} A` }); }
  return result({ V, I, R, P }, 'V, A, Ω, W', steps);
}

/** Three-phase real power P = √3 · V_L · I_L · PF (watts). */
export function threePhasePower(VL: number, IL: number, PF = 1): Result {
  const P = Math.sqrt(3) * VL * IL * PF;
  return result(P, 'W', [{ label: 'Three-phase power', formula: 'P = √3 · V_L · I_L · PF', work: `1.732 × ${sig(VL)} × ${sig(IL)} × ${sig(PF)}`, result: `${sig(P)} W` }]);
}
/** Three-phase apparent power kVA = √3 · V · I / 1000. */
export function threePhaseKVA(V: number, I: number): Result {
  const kva = (Math.sqrt(3) * V * I) / 1000;
  return result(kva, 'kVA', [{ label: 'Apparent power', formula: 'kVA = √3 · V · I / 1000', work: `1.732 × ${sig(V)} × ${sig(I)} / 1000`, result: `${sig(kva)} kVA` }]);
}

// ---------- conductors ----------
/** AWG gauge number: "1/0" = 0, "2/0" = -1, "3/0" = -2, "4/0" = -3. */
export function awgNumber(size: string | number): number {
  if (typeof size === 'number') return size;
  const s = size.trim().toUpperCase().replace(/^#|\s*AWG$/g, '');
  const m = s.match(/^([1-4])\/0$/);
  if (m) return 1 - Number(m[1]);
  if (/^\d+$/.test(s)) return Number(s);
  throw new Error(`Unknown AWG size "${size}". For 250 kcmil and up, enter kcmil directly.`);
}
/** Circular mils from the AWG definition: d(in) = 0.005 · 92^((36 − n)/39), CM = (d in mils)². */
export function awgToCircularMils(size: string | number): Result {
  const n = awgNumber(size);
  const dIn = 0.005 * Math.pow(92, (36 - n) / 39);
  const dMil = dIn * 1000;
  const cm = dMil * dMil;
  return result(cm, 'cmil', [
    { label: 'Diameter', formula: 'd = 0.005 in · 92^((36 − n) / 39)', work: `0.005 × 92^((36 − ${n}) / 39)`, result: `${sig(dIn)} in = ${sig(dMil)} mil` },
    { label: 'Area', formula: 'CM = d(mil)²', work: `${sig(dMil)}²`, result: `${sig(cm)} cmil` },
  ], ['Computed from the AWG definition; published tables round these values.']);
}
export const kcmilToCircularMils = (kcmil: number) => kcmil * 1000;
export const circularMilsToMm2 = (cm: number) => cm * (Math.PI / 4) * Math.pow(0.0254, 2); // 1 mil = 0.0254 mm

// ---------- voltage drop ----------
export interface VoltageDropInput {
  phase: 1 | 3;
  current: number;            // A
  lengthFt: number;           // one-way length, feet
  size?: string | number;     // AWG ("12", "1/0") ...
  kcmil?: number;             // ... or kcmil (250, 500)
  material?: 'copper' | 'aluminum';
  K?: number;                 // ohm-cmil per foot; defaults 12.9 Cu, 21.2 Al (editable)
  systemVolts: number;        // e.g. 120, 240, 208, 480
  targetPercent?: number;     // e.g. 3 for a branch circuit
}
export function voltageDrop(i: VoltageDropInput): Result<{ volts: number; percent: number; withinTarget: boolean | null; endVolts: number }> {
  const material = i.material || 'copper';
  const K = i.K ?? (material === 'aluminum' ? 21.2 : 12.9);
  const steps: Step[] = [];
  let CM: number;
  if (i.kcmil) { CM = kcmilToCircularMils(i.kcmil); steps.push({ label: 'Conductor area', formula: 'CM = kcmil × 1000', work: `${i.kcmil} × 1000`, result: `${sig(CM)} cmil` }); }
  else if (i.size !== undefined) { const c = awgToCircularMils(i.size); CM = c.value; steps.push(...c.steps.map(s => ({ ...s, label: `${s.label} (#${i.size} AWG)` }))); }
  else throw new Error('Enter a conductor size (AWG or kcmil).');
  steps.push({ label: 'Conductor constant', formula: `K (${material})`, work: i.K !== undefined ? 'entered' : 'default', result: `${K} Ω·cmil/ft` });
  const factor = i.phase === 3 ? Math.sqrt(3) : 2;
  const vd = (factor * K * i.current * i.lengthFt) / CM;
  steps.push({ label: 'Voltage drop', formula: i.phase === 3 ? 'VD = √3 · K · I · L / CM' : 'VD = 2 · K · I · L / CM',
    work: `${i.phase === 3 ? '1.732' : '2'} × ${K} × ${sig(i.current)} × ${sig(i.lengthFt)} / ${sig(CM)}`, result: `${sig(vd)} V` });
  const pct = (vd / i.systemVolts) * 100;
  steps.push({ label: 'Percent drop', formula: '%VD = VD / V × 100', work: `${sig(vd)} / ${sig(i.systemVolts)} × 100`, result: `${sig(pct)} %` });
  const end = i.systemVolts - vd;
  steps.push({ label: 'Voltage at the load', formula: 'V_load = V − VD', work: `${sig(i.systemVolts)} − ${sig(vd)}`, result: `${sig(end)} V` });
  const within = i.targetPercent === undefined ? null : pct <= i.targetPercent;
  const notes = within === null ? [] : [within ? `Within your ${i.targetPercent}% target.` : `Over your ${i.targetPercent}% target. A larger conductor or a shorter run lowers the drop.`];
  return result({ volts: vd, percent: pct, withinTarget: within, endVolts: end }, 'V', steps, notes);
}

// ---------- transformers and motors ----------
export function transformerFullLoadCurrent(kVA: number, volts: number, phase: 1 | 3): Result {
  const I = phase === 3 ? (kVA * 1000) / (Math.sqrt(3) * volts) : (kVA * 1000) / volts;
  return result(I, 'A', [{ label: 'Full-load current', formula: phase === 3 ? 'I = kVA · 1000 / (√3 · V)' : 'I = kVA · 1000 / V',
    work: phase === 3 ? `${sig(kVA)} × 1000 / (1.732 × ${sig(volts)})` : `${sig(kVA)} × 1000 / ${sig(volts)}`, result: `${sig(I)} A` }]);
}
export function turnsRatio(primaryVolts: number, secondaryVolts: number): Result {
  const r = primaryVolts / secondaryVolts;
  return result(r, ':1', [{ label: 'Turns ratio', formula: 'a = V_p / V_s', work: `${sig(primaryVolts)} / ${sig(secondaryVolts)}`, result: `${sig(r)} : 1` }]);
}
/** Motor current from the nameplate or the user's table, times the user's multiplier (e.g. a percentage for conductor sizing). */
export function motorCurrent(fullLoadAmps: number, multiplier: number, label = 'Applied multiplier'): Result {
  const I = fullLoadAmps * multiplier;
  return result(I, 'A', [{ label, formula: 'I = FLA × multiplier', work: `${sig(fullLoadAmps)} × ${sig(multiplier)}`, result: `${sig(I)} A` }], ['Full-load current and multiplier come from the nameplate or your code book.']);
}

// ---------- conduit bending (trigonometry) ----------
export const offsetMultiplier = (deg: number) => 1 / Math.sin(rad(deg));
export const shrinkPerInch = (deg: number) => (1 - Math.cos(rad(deg))) / Math.sin(rad(deg)); // = tan(θ/2)
export const COMMON_ANGLES = [10, 22.5, 30, 45, 60];

/** Multiplier and shrink for each common angle, computed (not looked up). */
export function bendingTable(angles = COMMON_ANGLES) {
  return angles.map(a => ({ angle: a, multiplier: offsetMultiplier(a), shrinkPerInch: shrinkPerInch(a) }));
}

/** Two-bend offset of height H at angle θ: distance between bends and shrink. */
export function offset(heightIn: number, angleDeg: number): Result<{ distanceBetweenBends: number; shrink: number; multiplier: number; shrinkPerInch: number }> {
  const m = offsetMultiplier(angleDeg), s = shrinkPerInch(angleDeg);
  const dist = heightIn * m, shrink = heightIn * s;
  return result({ distanceBetweenBends: dist, shrink, multiplier: m, shrinkPerInch: s }, 'in', [
    { label: 'Multiplier', formula: 'M = 1 / sin θ', work: `1 / sin ${angleDeg}° = 1 / ${sig(Math.sin(rad(angleDeg)))}`, result: sig(m) },
    { label: 'Distance between bends', formula: 'D = H × M', work: `${sig(heightIn)} × ${sig(m)}`, result: `${sig(dist)} in (${inchFraction(dist)})` },
    { label: 'Shrink per inch of offset', formula: 's = (1 − cos θ) / sin θ', work: `(1 − ${sig(Math.cos(rad(angleDeg)))}) / ${sig(Math.sin(rad(angleDeg)))}`, result: `${sig(s)} in/in` },
    { label: 'Total shrink', formula: 'S = H × s', work: `${sig(heightIn)} × ${sig(s)}`, result: `${sig(shrink)} in (${inchFraction(shrink)})` },
  ], ['Add the shrink to your measurement to the first mark when working toward an obstruction.']);
}

/** Rolling offset: true offset = √(rise² + roll²), then a normal offset of that size. */
export function rollingOffset(riseIn: number, rollIn: number, angleDeg: number) {
  const trueOffset = Math.hypot(riseIn, rollIn);
  const o = offset(trueOffset, angleDeg);
  o.steps.unshift({ label: 'True offset', formula: 'T = √(rise² + roll²)', work: `√(${sig(riseIn)}² + ${sig(rollIn)}²)`, result: `${sig(trueOffset)} in (${inchFraction(trueOffset)})` });
  return { ...o, value: { ...o.value, trueOffset } };
}

/** Three-point saddle over an obstruction of height H: center bend 2θ, outer bends θ (default 45°/22.5°). */
export function threePointSaddle(heightIn: number, outerAngleDeg = 22.5) {
  const m = offsetMultiplier(outerAngleDeg), s = shrinkPerInch(outerAngleDeg);
  const spacing = heightIn * m;
  const centerShift = heightIn * s;
  return result({ outerMarkSpacing: spacing, centerMarkShift: centerShift, totalShrink: 2 * centerShift, centerAngle: 2 * outerAngleDeg }, 'in', [
    { label: 'Mark spacing (center to each outer mark)', formula: 'D = H / sin θ', work: `${sig(heightIn)} / sin ${outerAngleDeg}°`, result: `${sig(spacing)} in (${inchFraction(spacing)})` },
    { label: 'Center mark shift (one leg of shrink)', formula: 'S₁ = H · (1 − cos θ) / sin θ', work: `${sig(heightIn)} × ${sig(s)}`, result: `${sig(centerShift)} in (${inchFraction(centerShift)})` },
    { label: 'Total shrink of the saddle', formula: 'S = 2 · S₁', work: `2 × ${sig(centerShift)}`, result: `${sig(2 * centerShift)} in (${inchFraction(2 * centerShift)})` },
  ], [`Center bend ${2 * outerAngleDeg}°, outer bends ${outerAngleDeg}°. Move the center mark forward by S₁ to land the saddle on the obstruction center.`]);
}

/** Four-point saddle: two offsets of height H at angle θ, around an obstruction of width W. */
export function fourPointSaddle(heightIn: number, widthIn: number, angleDeg = 45) {
  const o = offset(heightIn, angleDeg);
  return result({ ...o.value, innerMarkGap: widthIn, totalShrink: 2 * o.value.shrink }, 'in', [
    ...o.steps,
    { label: 'Gap between the two inner bends', formula: 'G = obstruction width', work: `${sig(widthIn)}`, result: `${sig(widthIn)} in (${inchFraction(widthIn)})` },
    { label: 'Total shrink', formula: 'S = 2 × H × s', work: `2 × ${sig(heightIn)} × ${sig(o.value.shrinkPerInch)}`, result: `${sig(2 * o.value.shrink)} in (${inchFraction(2 * o.value.shrink)})` },
  ]);
}

/** 90° stub-up: mark = stub height − your bender's deduct (take-up). */
export function stubUp(stubHeightIn: number, benderDeductIn: number) {
  const mark = stubHeightIn - benderDeductIn;
  return result(mark, 'in', [{ label: 'Mark from the end', formula: 'Mark = stub height − deduct', work: `${sig(stubHeightIn)} − ${sig(benderDeductIn)}`, result: `${sig(mark)} in (${inchFraction(mark)})` }], ['Use the deduct printed on your bender for this conduit size.']);
}

/** Back-to-back 90°: second mark measured from the back of the first stub, bent at the back-of-bend mark. */
export function backToBack(outsideToOutsideIn: number) {
  return result(outsideToOutsideIn, 'in', [{ label: 'Second mark from the back of the first stub', formula: 'Mark = outside-to-outside distance', work: `${sig(outsideToOutsideIn)}`, result: `${sig(outsideToOutsideIn)} in (${inchFraction(outsideToOutsideIn)})` }], ['Line this mark up with the back-of-bend (star) mark on your bender, not the arrow.']);
}

// ---------- fill (user's table supplies allowances) ----------
/** Box or conduit fill: the user's table gives the per-item allowances and the available space. */
export function fill(items: Array<{ label: string; count: number; allowance: number }>, available: number, unit = 'in³') {
  const used = items.reduce((t, i) => t + i.count * i.allowance, 0);
  const pct = (used / available) * 100;
  return result({ used, percent: pct }, unit, [
    ...items.map(i => ({ label: i.label, formula: 'count × allowance', work: `${i.count} × ${sig(i.allowance)}`, result: `${sig(i.count * i.allowance)} ${unit}` })),
    { label: 'Total used', formula: 'Σ', work: items.map(i => sig(i.count * i.allowance)).join(' + '), result: `${sig(used)} ${unit}` },
    { label: 'Fill', formula: 'used / available × 100', work: `${sig(used)} / ${sig(available)} × 100`, result: `${sig(pct)} %` },
  ], ['Allowances and limits come from your code book.']);
}

// ---------- conversions ----------
export const ftToM = (ft: number) => ft * 0.3048;
export const mToFt = (m: number) => m / 0.3048;
export const hpToKw = (hp: number) => hp * 0.745699872;
export const kwToHp = (kw: number) => kw / 0.745699872;
export const fToC = (f: number) => ((f - 32) * 5) / 9;
export const cToF = (c: number) => (c * 9) / 5 + 32;
export const awgToMm2 = (size: string | number) => circularMilsToMm2(awgToCircularMils(size).value);
