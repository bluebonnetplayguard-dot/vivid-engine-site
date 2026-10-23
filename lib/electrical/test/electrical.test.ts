// Each case is checked against a hand calculation to 4 significant figures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../index.ts';

const near = (actual: number, expected: number, msg = '') =>
  assert.equal(Number(actual.toPrecision(4)), Number(expected.toPrecision(4)), `${msg} got ${actual}, expected ${expected}`);

test("Ohm's law from any two values", () => {
  const r = E.ohmsLaw({ V: 120, I: 10 });
  near(r.value.R, 12); near(r.value.P, 1200);
  const p = E.ohmsLaw({ P: 1500, V: 120 });
  near(p.value.I, 12.5); near(p.value.R, 9.6);
  const q = E.ohmsLaw({ P: 100, R: 4 });
  near(q.value.V, 20); near(q.value.I, 5);
  assert.throws(() => E.ohmsLaw({ V: 1 }));
});

test('three-phase power and kVA', () => {
  near(E.threePhasePower(480, 50, 0.9).value, 37410);     // 1.7320508 × 480 × 50 × 0.9 = 37,411.3
  near(E.threePhaseKVA(208, 100).value, 36.03);           // 1.7320508 × 208 × 100 / 1000 = 36.0267
});

test('circular mils from the AWG definition', () => {
  near(E.awgToCircularMils(12).value, 6530);              // d = 80.81 mil
  near(E.awgToCircularMils(10).value, 10380);             // d = 101.9 mil
  near(E.awgToCircularMils('1/0').value, 105500);         // d = 324.87 mil, 324.87² = 105,540 (tables round to 105,600)
  near(E.awgToCircularMils('4/0').value, 211600);         // d = 460.0 mil
  assert.equal(E.awgNumber('2/0'), -1);
});

test('single-phase voltage drop: 20 A, 100 ft, #12 Cu, 120 V', () => {
  const r = E.voltageDrop({ phase: 1, current: 20, lengthFt: 100, size: 12, systemVolts: 120, targetPercent: 3 });
  near(r.value.volts, 7.902);                             // 2 × 12.9 × 20 × 100 / 6529.9
  near(r.value.percent, 6.585);
  assert.equal(r.value.withinTarget, false);
  assert.ok(r.steps.some(s => s.formula.startsWith('VD = 2')));
  assert.equal(r.disclaimer, E.DISCLAIMER);
});

test('three-phase voltage drop with kcmil aluminum', () => {
  const r = E.voltageDrop({ phase: 3, current: 150, lengthFt: 200, kcmil: 250, material: 'aluminum', systemVolts: 480 });
  near(r.value.volts, 4.406);                             // 1.732 × 21.2 × 150 × 200 / 250,000
  near(r.value.percent, 0.9180);                          // 4.4063 / 480 × 100
});

test('transformers', () => {
  near(E.transformerFullLoadCurrent(75, 208, 3).value, 208.2);   // 75,000 / (1.732 × 208)
  near(E.transformerFullLoadCurrent(25, 240, 1).value, 104.2);
  near(E.turnsRatio(480, 120).value, 4);
});

test('bending multipliers and shrink are computed from trig', () => {
  const t = Object.fromEntries(E.bendingTable().map(r => [r.angle, r]));
  near(t[10].multiplier, 5.759); near(t[10].shrinkPerInch, 0.08749);
  near(t[22.5].multiplier, 2.613); near(t[22.5].shrinkPerInch, 0.1989);
  near(t[30].multiplier, 2.000); near(t[30].shrinkPerInch, 0.2679);
  near(t[45].multiplier, 1.414); near(t[45].shrinkPerInch, 0.4142);
  near(t[60].multiplier, 1.155); near(t[60].shrinkPerInch, 0.5774);
});

test('30° offset of 6 inches', () => {
  const r = E.offset(6, 30);
  near(r.value.distanceBetweenBends, 12);
  near(r.value.shrink, 1.608);                            // 6 × 0.26795
  assert.equal(E.inchFraction(r.value.shrink), '1-5/8"');
});

test('rolling offset, saddles, stub-up', () => {
  const ro = E.rollingOffset(9, 12, 30);
  near(ro.value.trueOffset, 15); near(ro.value.distanceBetweenBends, 30);
  const s3 = E.threePointSaddle(2);
  near(s3.value.outerMarkSpacing, 5.226); near(s3.value.centerMarkShift, 0.3978); assert.equal(s3.value.centerAngle, 45);
  const s4 = E.fourPointSaddle(4, 6, 45);
  near(s4.value.distanceBetweenBends, 5.657); near(s4.value.totalShrink, 3.314);
  near(E.stubUp(10, 5).value, 5);
});

test('fill and conversions', () => {
  const f = E.fill([{ label: '#12 conductors', count: 6, allowance: 2.25 }, { label: 'Device', count: 1, allowance: 4.5 }], 18);
  near(f.value.used, 18); near(f.value.percent, 100);
  near(E.awgToMm2(12), 3.309);
  near(E.hpToKw(10), 7.457); near(E.fToC(86), 30); near(E.ftToM(100), 30.48);
});
