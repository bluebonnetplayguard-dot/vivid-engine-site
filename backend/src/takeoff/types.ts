import type { DimensionSource } from '../building-model';

// Takeoff = material quantities computed from the structured model through the geometry reader.
// Every quantity says whether it rests on verified sizes and where its sizes came from.

export type TakeoffSource = 'blueprint' | 'ai-inferred' | 'contractor' | 'sample';
export const toTakeoffSource = (s: DimensionSource): TakeoffSource => s;

// The shape the spec asks every calculator to return.
export interface Quantity {
  value: number;
  verified: boolean;
  source: TakeoffSource;
  from: string[];
}

export type TakeoffUnit = 'sq ft' | 'sq yd' | 'lf' | 'cu yd' | 'ea' | 'sheets' | 'gal' | 'bundles' | 'squares' | 'rolls' | 'pcs' | 'bags';

export type TakeoffCategory =
  | 'concrete' | 'framing' | 'sheathing' | 'insulation' | 'exterior' | 'roofing'
  | 'openings' | 'drywall' | 'paint' | 'trim' | 'flooring' | 'cabinets' | 'countertops';

export interface TakeoffLine {
  key: string;                 // stable id, e.g. "siding.brick" or "framing.studs-2x6"
  category: TakeoffCategory;
  item: string;                // what to buy, plain words
  material: string | null;     // studio material id when the line comes from a finish choice
  unit: TakeoffUnit;
  quantity: number;            // net, before waste
  wastePct: number;            // 10 = 10 %
  order: number;               // quantity to order: net × (1 + waste), rounded up for whole units
  basis: string;               // how it was calculated, plain words
  verified: boolean;
  source: TakeoffSource;
  from: string[];              // model element ids
}

export interface TakeoffSettings {
  drywallSheetSqFt: number;    // 48 = 4'×12'
  paintCoats: number;
  paintCoverageSqFt: number;   // per gallon per coat
  primerCoverageSqFt: number;
  exteriorPaintCoverageSqFt: number;
  studSpacingIn: number;       // 16 or 24
  plateStockFt: number;        // 16' plates
  sheathingSheetSqFt: number;  // 32 = 4'×8'
  houseWrapRollSqFt: number;   // 9' × 150'
  underlaymentSquaresPerRoll: number;
  bundlesPerSquare: Record<string, number>;
  dripEdgePieceFt: number;
  concreteBagCuFt: number;     // 80 lb bag ≈ 0.6 cu ft
  waste: Record<TakeoffCategory, number>;
}

export const DEFAULT_SETTINGS: TakeoffSettings = {
  drywallSheetSqFt: 48,
  paintCoats: 2,
  paintCoverageSqFt: 350,
  primerCoverageSqFt: 300,
  exteriorPaintCoverageSqFt: 250,
  studSpacingIn: 16,
  plateStockFt: 16,
  sheathingSheetSqFt: 32,
  houseWrapRollSqFt: 1350,
  underlaymentSquaresPerRoll: 10,
  bundlesPerSquare: { 'asphalt-shingle': 3, 'cedar-shake': 4 },
  dripEdgePieceFt: 10,
  concreteBagCuFt: 0.6,
  waste: { concrete: 5, framing: 10, sheathing: 10, insulation: 5, exterior: 10, roofing: 10, openings: 0, drywall: 10, paint: 0, trim: 10, flooring: 10, cabinets: 0, countertops: 5 },
};

export interface TakeoffFlag { severity: 'info' | 'warning'; message: string; lines?: string[] }

export interface TakeoffResult {
  engine: 'gc-takeoff/1';
  model: { id: string; name: string; source: string };
  computedAt: string;
  settings: TakeoffSettings;
  lines: TakeoffLine[];
  summary: {
    floorArea: number;          // sq ft, all rooms
    exteriorWallArea: number;   // sq ft, outside faces net of openings
    roofArea: number;           // sq ft surface
    lineCount: number;
    verifiedLines: number;
  };
  flags: TakeoffFlag[];
  assumptions: string[];        // what the takeoff does not include or assumes
}
