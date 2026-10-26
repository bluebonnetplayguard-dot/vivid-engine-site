import { CostItem, CostTable } from './types';

// Built-in STARTER cost table. These are rough placeholder prices so a new account sees a complete estimate
// shape; they are not market research and not a quote. Every line priced from this table is marked
// priceSource 'starter', and every estimate using it carries a warning. Contractors replace them by saving
// their own cost table (POST /api/cost-tables) or with per-estimate overrides.

const S = 'starter' as const;
const mat = (unitCost: number, note?: string) => ({ unitCost, source: S, ...(note ? { note } : {}) });
const sub = (unitCost: number, trade: string) => ({ unitCost, trade, source: S });
const labor = (hoursPerUnit: number) => ({ hoursPerUnit });

const items: CostItem[] = [
  // Concrete: ready-mix delivered + placing and finishing sub
  { match: 'concrete.slab', unit: 'cu yd', material: mat(165), sub: sub(120, 'Concrete') },
  { match: 'concrete.patio', unit: 'cu yd', material: mat(165), sub: sub(140, 'Concrete') },

  // Framing lumber + framing crew hours
  { match: 'framing.studs-2x6-*', unit: 'ea', material: mat(9.5), labor: labor(0.15) },
  { match: 'framing.studs-2x4-*', unit: 'ea', material: mat(5.25), labor: labor(0.12) },
  { match: 'framing.plates-2x6', unit: 'pcs', material: mat(16), labor: labor(0.25) },
  { match: 'framing.plates-2x4', unit: 'pcs', material: mat(11), labor: labor(0.2) },
  { match: 'framing.headers-*', unit: 'lf', material: mat(2.4), labor: labor(0.05) },
  { match: 'framing.cripples-2x6', unit: 'ea', material: mat(4.75), labor: labor(0.08) },
  { match: 'framing.cripples-2x4', unit: 'ea', material: mat(2.75), labor: labor(0.06) },
  { match: 'framing.subfloor', unit: 'sheets', material: mat(48), labor: labor(0.35) },
  { match: 'framing.patio-posts', unit: 'ea', material: mat(65), labor: labor(1.5) },
  { match: 'framing.patio-beam', unit: 'lf', material: mat(14), labor: labor(0.25) },

  // Sheathing, wrap, insulation
  { match: 'sheathing.walls', unit: 'sheets', material: mat(18), labor: labor(0.3) },
  { match: 'sheathing.roof', unit: 'sheets', material: mat(18), labor: labor(0.35) },
  { match: 'exterior.house-wrap', unit: 'rolls', material: mat(190), labor: labor(3) },
  { match: 'insulation.walls', unit: 'sq ft', material: mat(0.95), sub: sub(0.6, 'Insulation') },
  { match: 'insulation.attic', unit: 'sq ft', material: mat(0.85), sub: sub(0.55, 'Insulation') },

  // Siding by finish
  { match: 'exterior.siding.vinyl-lap', unit: 'squares', material: mat(160), sub: sub(210, 'Siding') },
  { match: 'exterior.siding.fiber-cement-lap', unit: 'squares', material: mat(310), sub: sub(360, 'Siding') },
  { match: 'exterior.siding.board-batten', unit: 'sq ft', material: mat(3.1), sub: sub(3, 'Siding') },
  { match: 'exterior.siding.brick', unit: 'ea', material: mat(0.75), sub: sub(0.95, 'Masonry') },
  { match: 'exterior.siding.brick-white', unit: 'ea', material: mat(0.75), sub: sub(0.95, 'Masonry') },
  { match: 'exterior.siding.stone', unit: 'sq ft', material: mat(11), sub: sub(14, 'Masonry') },
  { match: 'exterior.siding.stucco', unit: 'sq yd', material: mat(25), sub: sub(55, 'Stucco') },
  { match: 'exterior.siding.metal-panel', unit: 'sq ft', material: mat(6.5), sub: sub(5, 'Siding') },
  { match: 'paint.exterior', unit: 'gal', material: mat(58), sub: sub(120, 'Painting') },

  // Roofing by material; accessories are installed by the roofing sub as part of the field price
  { match: 'roofing.asphalt-shingle', unit: 'bundles', material: mat(42), sub: sub(95, 'Roofing') },
  { match: 'roofing.cedar-shake', unit: 'bundles', material: mat(95), sub: sub(120, 'Roofing') },
  { match: 'roofing.standing-seam', unit: 'sq ft', material: mat(7.5), sub: sub(6, 'Roofing') },
  { match: 'roofing.clay-tile', unit: 'squares', material: mat(450), sub: sub(500, 'Roofing') },
  { match: 'roofing.patio.*', unit: 'sq ft', material: mat(7.5), sub: sub(6.5, 'Roofing') },
  { match: 'roofing.underlayment', unit: 'rolls', material: mat(95) },
  { match: 'roofing.drip-edge', unit: 'pcs', material: mat(9) },
  { match: 'roofing.starter', unit: 'lf', material: mat(1.1) },
  { match: 'roofing.ridge-cap', unit: 'lf', material: mat(3.2) },

  // Windows and doors (allowances per unit, set by the contractor's supplier)
  { match: 'openings.window.*', unit: 'ea', material: mat(650, 'allowance per window'), labor: labor(2.5) },
  { match: 'openings.door.ext.steel-door.*', unit: 'ea', material: mat(900, 'allowance'), labor: labor(4) },
  { match: 'openings.door.ext.wood-door.*', unit: 'ea', material: mat(1400, 'allowance'), labor: labor(4) },
  { match: 'openings.door.ext.glass-door.*', unit: 'ea', material: mat(1800, 'allowance'), labor: labor(5) },
  { match: 'openings.door.int.*', unit: 'ea', material: mat(260, 'allowance'), labor: labor(1.5) },
  { match: 'openings.cased.*', unit: 'ea', material: mat(140), labor: labor(2) },

  // Drywall and paint
  { match: 'drywall.walls', unit: 'sheets', material: mat(18), sub: sub(22, 'Drywall') },
  { match: 'drywall.ceilings', unit: 'sheets', material: mat(21), sub: sub(26, 'Drywall') },
  { match: 'drywall.finish', unit: 'sq ft', material: mat(0.12), sub: sub(1.25, 'Drywall') },
  { match: 'paint.walls', unit: 'gal', material: mat(45), sub: sub(110, 'Painting') },
  { match: 'paint.ceilings', unit: 'gal', material: mat(40), sub: sub(110, 'Painting') },
  { match: 'paint.primer', unit: 'gal', material: mat(32), sub: sub(60, 'Painting') },

  // Trim carpentry
  { match: 'trim.exterior-casing', unit: 'lf', material: mat(2.8), labor: labor(0.08) },
  { match: 'trim.interior-casing', unit: 'lf', material: mat(1.9), labor: labor(0.07) },
  { match: 'trim.baseboard', unit: 'lf', material: mat(1.7), labor: labor(0.06) },

  // Flooring by finish
  { match: 'flooring.oak-floor', unit: 'sq ft', material: mat(7.5), sub: sub(4.5, 'Flooring') },
  { match: 'flooring.lvp-gray', unit: 'sq ft', material: mat(3.4), sub: sub(2.25, 'Flooring') },
  { match: 'flooring.tile-floor', unit: 'sq ft', material: mat(4.8), sub: sub(7.5, 'Tile') },
  { match: 'flooring.carpet', unit: 'sq yd', material: mat(28), sub: sub(9, 'Flooring') },

  // Cabinets (allowances per linear foot) and countertops (fabricated and installed)
  { match: 'cabinets.base.*', unit: 'lf', material: mat(360, 'allowance'), labor: labor(1.2) },
  { match: 'cabinets.upper.*', unit: 'lf', material: mat(260, 'allowance'), labor: labor(1) },
  { match: 'cabinets.island.*', unit: 'lf', material: mat(400, 'allowance'), labor: labor(1.5) },
  { match: 'cabinets.*.walnut-cabinet', unit: 'lf', material: mat(560, 'allowance'), labor: labor(1.3) },
  { match: 'countertops.quartz-white', unit: 'sq ft', sub: sub(75, 'Countertops') },
  { match: 'countertops.granite-black', unit: 'sq ft', sub: sub(65, 'Countertops') },
  { match: 'countertops.butcher-block', unit: 'sq ft', material: mat(45), labor: labor(0.4) },
];

export const STARTER_COST_TABLE: CostTable = {
  id: 'starter',
  name: 'Starter prices (replace before quoting)',
  kind: 'starter',
  currency: 'USD',
  updatedAt: '2026-10-26',
  notice: 'Starter placeholder prices, not a quote or market research. Replace them with your supplier and subcontractor prices before sending an estimate.',
  laborRatePerHour: 55,
  items,
};
