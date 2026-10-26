import type { TakeoffCategory, TakeoffSource, TakeoffUnit } from '../takeoff';

// Estimating engine types. An estimate prices a takeoff with a cost table: materials on the order quantity
// (waste included), labor and subcontractor costs on the net installed quantity.

export type PriceSource = 'starter' | 'contractor' | 'supplier' | 'override';

export interface MaterialCost {
  unitCost: number;          // $ per takeoff unit
  source: PriceSource;
  note?: string;
}

export interface LaborCost {
  hoursPerUnit: number;      // crew hours per installed unit, priced at the table's labor rate
}

export interface SubcontractorCost {
  unitCost: number;          // $ per installed unit, labor (and sub-supplied consumables) included
  trade: string;             // e.g. "Roofing", "Drywall"
  source: PriceSource;
}

export interface CostItem {
  match: string;             // takeoff line key or pattern with * wildcards, e.g. "framing.studs-2x6-*"
  unit: TakeoffUnit;         // must equal the takeoff line's unit, or the line is left unpriced
  material?: MaterialCost;
  labor?: LaborCost;
  sub?: SubcontractorCost;
}

export interface CostTable {
  id: string;                // 'starter' for the built-in table
  name: string;
  kind: 'starter' | 'contractor';
  currency: 'USD';
  updatedAt: string;
  notice?: string;
  laborRatePerHour: number;  // loaded crew rate
  items: CostItem[];
}

export interface RegionalMultiplier { region: string; material: number; labor: number }

export interface EstimateSettings {
  costTableId: string;
  region: RegionalMultiplier;        // 1.0 = the cost table's own prices
  overheadPct: number;               // on direct cost
  contingencyPct: number;            // on direct cost
  pricing: 'margin' | 'markup';      // margin: price = cost / (1 − pct); markup: price = cost × (1 + pct)
  profitPct: number;
  salesTaxPct: number;               // on materials only; 0 when the contract handles tax differently
  overrides: Record<string, { materialUnitCost?: number; subUnitCost?: number; hoursPerUnit?: number }>;   // by takeoff line key
  exclude: string[];                 // takeoff line keys left out of this estimate
}

export interface EstimateLineItem {
  key: string;
  category: TakeoffCategory;
  description: string;
  unit: TakeoffUnit;
  quantity: number;                  // net installed quantity
  orderQuantity: number;             // purchase quantity (waste included)
  materialUnitCost: number;
  materialCost: number;
  laborHours: number;
  laborCost: number;
  subUnitCost: number;
  subCost: number;
  subTrade: string | null;
  total: number;                     // direct cost of the line
  priced: boolean;                   // false when no cost item matched; total is then 0
  priceSource: PriceSource | null;   // weakest price source used on the line
  verified: boolean;                 // the quantity rests on verified sizes
  source: TakeoffSource;
}

export interface CategoryTotal { category: TakeoffCategory; material: number; labor: number; sub: number; total: number }

export interface EstimateTotals {
  material: number; salesTax: number; labor: number; laborHours: number; sub: number;
  direct: number; overhead: number; contingency: number; cost: number;
  profit: number; price: number;
  pricePerSqFt: number | null;
  byCategory: CategoryTotal[];
}

export interface EstimateFlag { severity: 'info' | 'warning'; message: string; lines?: string[] }

export interface AlternateComparison {
  designId: string; title: string;
  price: number; delta: number;      // vs the base estimate's price
  byCategory: { category: TakeoffCategory; delta: number }[];
  changes: { key: string; description: string; delta: number }[];   // lines that differ, largest first
}

export interface EstimateResult {
  engine: 'gc-estimate/1';
  computedAt: string;
  design: { id: string; title: string; version: number };
  takeoff: { inputHash: string; lineCount: number };
  costTable: { id: string; name: string; kind: CostTable['kind']; notice?: string };
  settings: EstimateSettings;
  lines: EstimateLineItem[];
  totals: EstimateTotals;
  alternates: AlternateComparison[];
  flags: EstimateFlag[];
}
