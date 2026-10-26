import { ComponentReading, Measured, RoofReading, RoomReading, WallReading, toCuYd, toFt, toSqFt } from '../geometry-reader';
import { Quantity, TakeoffSettings } from './types';

// Geometry -> quantity calculators. Each returns { value, verified, source, from } so a quantity always
// carries the provenance of the sizes it came from. Areas are square feet, lengths linear feet, volumes cubic
// yards; counts are whole pieces before waste.

const RANK = { sample: 0, 'ai-inferred': 1, contractor: 2, blueprint: 3 } as const;

export function q(value: number, ...inputs: Pick<Measured, 'verified' | 'source' | 'from'>[]): Quantity {
  const source = inputs.reduce<Measured['source']>((w, m) => (RANK[m.source] < RANK[w] ? m.source : w), inputs[0]?.source ?? 'sample');
  return { value, verified: inputs.length > 0 && inputs.every(m => m.verified), source, from: [...new Set(inputs.flatMap(m => m.from))] };
}

export function sum(qs: Quantity[]): Quantity {
  if (!qs.length) return { value: 0, verified: false, source: 'sample', from: [] };
  return q(qs.reduce((s, x) => s + x.value, 0), ...qs);
}

// Net wall area in sq ft. side: 'exterior' (outside face, corners included), 'interior' (inside face at
// ceiling height) or 'centerline' (gross length × height − openings).
export function calculateWallArea(wall: WallReading, side: 'exterior' | 'interior' | 'centerline' = 'centerline'): Quantity {
  const m = side === 'exterior' ? wall.exteriorFaceArea ?? wall.netArea : side === 'interior' ? wall.interiorFaceArea : wall.netArea;
  return q(toSqFt(Math.max(0, m.value)), m);
}

export function calculateFloorArea(room: RoomReading): Quantity {
  return q(toSqFt(room.area.value), room.area);
}

export function calculateRoofArea(roof: RoofReading): Quantity {
  return q(toSqFt(roof.surfaceArea.value), roof.surfaceArea);
}

// Cubic yards of concrete in a slab or footing component.
export function calculateConcreteVolume(foundation: ComponentReading): Quantity {
  return q(toCuYd(foundation.volume.value), foundation.volume);
}

// Sheets of drywall for a surface area (sq ft), before waste.
export function calculateDrywallSheets(wallArea: Quantity, settings: Pick<TakeoffSettings, 'drywallSheetSqFt'>): Quantity {
  return { ...wallArea, value: Math.ceil(wallArea.value / settings.drywallSheetSqFt) };
}

// Gallons of paint for an area (sq ft): coats × area / coverage, rounded up to whole gallons.
export function calculatePaintGallons(wallArea: Quantity, coats: number, coverageSqFt: number): Quantity {
  return { ...wallArea, value: Math.ceil((wallArea.value * coats) / coverageSqFt) };
}

export interface LumberCount {
  studs: Quantity;        // full-height studs, incl. king and jack studs and corners
  plateLf: Quantity;      // bottom plate + double top plate
  plates: Quantity;       // plate stock pieces
  headerLf: Quantity;     // doubled headers over openings (opening width + 3" bearing), two plies
  cripples: Quantity;     // short studs above headers and below window sills
  size: '2x4' | '2x6';
  studLengthFt: number;
}

// Wall framing for one wall at the given stud spacing. Exterior walls (≥ 5 1/2" thick) are 2x6.
// framedHeightIn: plate-to-plate wall height (a first-floor wall's height includes the floor framing band
// above it, which is rim joist, not studs); defaults to the wall height.
export function calculateLumberCounts(wall: WallReading, openings: { width: number; sill: number; kind: 'window' | 'door' }[], settings: Pick<TakeoffSettings, 'studSpacingIn' | 'plateStockFt'>, framedHeightIn = wall.height.value): LumberCount {
  const L = wall.length.value, sp = settings.studSpacingIn;
  const layout = Math.ceil(L / sp) + 1;                                 // studs on layout, both ends included
  const displaced = openings.reduce((n, o) => n + Math.max(0, Math.floor(o.width / sp) - 1), 0);
  const perOpening = openings.length * 4;                               // 2 kings + 2 jacks
  const corners = wall.exterior ? 2 : 1;                                // corner / partition backing
  const cripples = openings.reduce((n, o) => n + (Math.ceil(o.width / sp) + 1) * (o.kind === 'window' && o.sill > 0 ? 2 : 1), 0);
  const plateLf = toFt(L) * 3;
  const headerLf = openings.reduce((s, o) => s + toFt(o.width + 3) * 2, 0);
  const base = wall.length;
  return {
    studs: q(Math.max(2, layout - displaced) + perOpening + corners, base),
    plateLf: q(plateLf, base),
    plates: q(Math.ceil(plateLf / settings.plateStockFt), base),
    headerLf: q(headerLf, base),
    cripples: q(cripples, base),
    size: wall.thickness.value >= 5.5 ? '2x6' : '2x4',
    studLengthFt: Math.round(toFt(framedHeightIn - 4.5) * 100) / 100,   // less three 1 1/2" plates
  };
}

// Linear feet along a length in inches.
export function calculateLinearFeet(lengthIn: Measured): Quantity { return q(toFt(lengthIn.value), lengthIn); }
