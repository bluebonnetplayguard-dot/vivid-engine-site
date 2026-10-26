import { TakeoffUnit } from './types';

// Studio material id -> how it is bought. Keeps the takeoff tied to the finishes chosen in the 3D Studio, so a
// material swap (brick vs siding, shingles vs metal) changes the takeoff and therefore the estimate.
// Ids match site/src/modules/gc-3d-design-studio/core/materials.js and backend/src/studio3d/vocabulary.ts.

export interface FinishRule {
  item: string;
  unit: TakeoffUnit;
  perSqFt: number;           // purchase units per square foot of finished surface
  basis: string;
  paintable?: boolean;       // field-painted exterior finish
}

export const SIDING: Record<string, FinishRule> = {
  'vinyl-lap': { item: 'Vinyl lap siding', unit: 'squares', perSqFt: 1 / 100, basis: 'exterior wall face, net of openings, 100 sq ft per square' },
  'fiber-cement-lap': { item: 'Fiber-cement lap siding', unit: 'squares', perSqFt: 1 / 100, basis: 'exterior wall face, net of openings, 100 sq ft per square', paintable: true },
  'board-batten': { item: 'Board-and-batten siding (panels + battens)', unit: 'sq ft', perSqFt: 1, basis: 'exterior wall face, net of openings', paintable: true },
  brick: { item: 'Brick veneer (modular brick)', unit: 'ea', perSqFt: 6.75, basis: '6.75 modular bricks per sq ft of wall face' },
  'brick-white': { item: 'Brick veneer (modular brick, painted)', unit: 'ea', perSqFt: 6.75, basis: '6.75 modular bricks per sq ft of wall face', paintable: true },
  stone: { item: 'Stone veneer', unit: 'sq ft', perSqFt: 1, basis: 'exterior wall face, net of openings' },
  stucco: { item: 'Stucco (3-coat system)', unit: 'sq yd', perSqFt: 1 / 9, basis: 'exterior wall face, net of openings, 9 sq ft per sq yd', paintable: false },
  'metal-panel': { item: 'Metal wall panels', unit: 'sq ft', perSqFt: 1, basis: 'exterior wall face, net of openings' },
};

export const ROOFING: Record<string, { item: string; unit: TakeoffUnit; basis: string }> = {
  'asphalt-shingle': { item: 'Architectural asphalt shingles', unit: 'bundles', basis: 'roof surface ÷ 100 sq ft × bundles per square' },
  'cedar-shake': { item: 'Cedar shakes', unit: 'bundles', basis: 'roof surface ÷ 100 sq ft × bundles per square' },
  'standing-seam': { item: 'Standing-seam metal roof panels', unit: 'sq ft', basis: 'roof surface' },
  'clay-tile': { item: 'Clay roof tile', unit: 'squares', basis: 'roof surface ÷ 100 sq ft' },
};

export const FLOORING: Record<string, { item: string; unit: TakeoffUnit; perSqFt: number; wastePct: number; basis: string }> = {
  'oak-floor': { item: 'Oak hardwood flooring', unit: 'sq ft', perSqFt: 1, wastePct: 10, basis: 'room floor area' },
  'lvp-gray': { item: 'Luxury vinyl plank', unit: 'sq ft', perSqFt: 1, wastePct: 10, basis: 'room floor area' },
  'tile-floor': { item: 'Porcelain floor tile', unit: 'sq ft', perSqFt: 1, wastePct: 15, basis: 'room floor area' },
  carpet: { item: 'Carpet and pad', unit: 'sq yd', perSqFt: 1 / 9, wastePct: 10, basis: 'room floor area ÷ 9' },
};

export const CABINETS: Record<string, string> = {
  'shaker-white': 'White shaker cabinets', 'shaker-navy': 'Navy shaker cabinets', 'walnut-cabinet': 'Walnut cabinets',
};

export const COUNTERTOPS: Record<string, string> = {
  'quartz-white': 'White quartz countertop', 'granite-black': 'Black granite countertop', 'butcher-block': 'Butcher-block countertop',
};

export const INTERIOR: Record<string, { item: string; paint: boolean }> = {
  drywall: { item: 'Painted drywall', paint: true },
  shiplap: { item: 'Shiplap (painted)', paint: true },
};
