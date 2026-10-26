// Material library for the GC 3D Design Studio. Each material belongs to one category, and each category
// lists which building surfaces it may be applied to. The 3D engine draws `pattern` procedurally
// (no image downloads), at `scale` inches per texture tile, so finishes keep real-world size.

export const CATEGORIES = {
  siding: { label: 'Exterior wall finish', surfaces: ['wall.exterior', 'component.patio-post'] },
  interior: { label: 'Interior wall finish', surfaces: ['wall.interior'] },
  roofing: { label: 'Roofing', surfaces: ['roof', 'component.patio-roof'] },
  trim: { label: 'Window and door frames', surfaces: ['opening.frame'] },
  door: { label: 'Door', surfaces: ['opening.door'] },
  flooring: { label: 'Flooring', surfaces: ['room.floor'] },
  cabinet: { label: 'Cabinets', surfaces: ['component.cabinet'] },
  countertop: { label: 'Countertops', surfaces: ['component.countertop'] },
  hardscape: { label: 'Patio and slab', surfaces: ['component.patio', 'component.slab'] },
};

export const MATERIALS = {
  // Exterior wall finishes
  'vinyl-lap': { name: 'Vinyl lap siding', category: 'siding', color: '#e9e6dc', pattern: 'lap', scale: 48, roughness: 0.6 },
  'fiber-cement-lap': { name: 'Fiber-cement lap siding', category: 'siding', color: '#d9d4c7', pattern: 'lap', scale: 56, roughness: 0.75 },
  'board-batten': { name: 'Board and batten', category: 'siding', color: '#f2f1ec', pattern: 'batten', scale: 48, roughness: 0.7 },
  brick: { name: 'Brick veneer', category: 'siding', color: '#9a4b36', pattern: 'brick', scale: 32, roughness: 0.92 },
  'brick-white': { name: 'Painted brick', category: 'siding', color: '#ecebe6', pattern: 'brick', scale: 32, roughness: 0.9 },
  stone: { name: 'Stone veneer', category: 'siding', color: '#8d877c', pattern: 'stone', scale: 48, roughness: 0.95 },
  stucco: { name: 'Stucco', category: 'siding', color: '#e3dccd', pattern: 'noise', scale: 36, roughness: 0.95 },
  'metal-panel': { name: 'Metal wall panel', category: 'siding', color: '#5b6470', pattern: 'ribs', scale: 36, roughness: 0.4, metalness: 0.5 },

  // Interior
  drywall: { name: 'Painted drywall', category: 'interior', color: '#f3f1ea', pattern: 'flat', scale: 48, roughness: 0.9 },
  shiplap: { name: 'Shiplap', category: 'interior', color: '#f6f5f0', pattern: 'lap', scale: 48, roughness: 0.8 },

  // Roofing
  'asphalt-shingle': { name: 'Architectural asphalt shingles', category: 'roofing', color: '#3f444b', pattern: 'shingle', scale: 60, roughness: 0.95 },
  'standing-seam': { name: 'Standing-seam metal roof', category: 'roofing', color: '#2a2d31', pattern: 'seam', scale: 36, roughness: 0.5, metalness: 0.3 },
  'clay-tile': { name: 'Clay tile', category: 'roofing', color: '#b5603c', pattern: 'tile', scale: 36, roughness: 0.8 },
  'cedar-shake': { name: 'Cedar shake', category: 'roofing', color: '#8a6744', pattern: 'shingle', scale: 40, roughness: 0.95 },

  // Frames and doors
  'vinyl-frame': { name: 'Vinyl window frame', category: 'trim', color: '#f4f4f1', pattern: 'flat', scale: 24, roughness: 0.5 },
  'aluminum-frame': { name: 'Aluminum window frame', category: 'trim', color: '#1d1f22', pattern: 'flat', scale: 24, roughness: 0.35, metalness: 0.6 },
  'wood-frame': { name: 'Wood window frame', category: 'trim', color: '#8b5e3c', pattern: 'wood', scale: 24, roughness: 0.7 },
  'steel-door': { name: 'Painted steel door', category: 'door', color: '#26394f', pattern: 'flat', scale: 40, roughness: 0.45, metalness: 0.3 },
  'wood-door': { name: 'Stained wood door', category: 'door', color: '#6e4528', pattern: 'wood', scale: 40, roughness: 0.65 },
  'glass-door': { name: 'Glass patio door', category: 'door', color: '#9fc6dd', pattern: 'flat', scale: 40, roughness: 0.1, opacity: 0.45 },

  // Floors
  'oak-floor': { name: 'Oak hardwood', category: 'flooring', color: '#b58a5a', pattern: 'planks', scale: 48, roughness: 0.6 },
  'lvp-gray': { name: 'Gray luxury vinyl plank', category: 'flooring', color: '#9c968c', pattern: 'planks', scale: 48, roughness: 0.55 },
  'tile-floor': { name: 'Porcelain tile', category: 'flooring', color: '#d8d4cc', pattern: 'grid', scale: 24, roughness: 0.4 },
  carpet: { name: 'Carpet', category: 'flooring', color: '#a8a39a', pattern: 'noise', scale: 24, roughness: 1 },

  // Cabinets and counters
  'shaker-white': { name: 'White shaker cabinets', category: 'cabinet', color: '#f1f0eb', pattern: 'flat', scale: 30, roughness: 0.5 },
  'shaker-navy': { name: 'Navy shaker cabinets', category: 'cabinet', color: '#273a56', pattern: 'flat', scale: 30, roughness: 0.5 },
  'walnut-cabinet': { name: 'Walnut cabinets', category: 'cabinet', color: '#5d3d27', pattern: 'wood', scale: 30, roughness: 0.6 },
  'quartz-white': { name: 'White quartz', category: 'countertop', color: '#f2f2ef', pattern: 'noise', scale: 30, roughness: 0.25 },
  'granite-black': { name: 'Black granite', category: 'countertop', color: '#26272a', pattern: 'noise', scale: 30, roughness: 0.25 },
  'butcher-block': { name: 'Butcher block', category: 'countertop', color: '#c08a52', pattern: 'wood', scale: 30, roughness: 0.6 },

  // Hardscape
  concrete: { name: 'Broom-finish concrete', category: 'hardscape', color: '#b7b5b0', pattern: 'noise', scale: 48, roughness: 0.95 },
  pavers: { name: 'Concrete pavers', category: 'hardscape', color: '#a69a88', pattern: 'grid', scale: 24, roughness: 0.9 },
};

export const COLORS = {
  white: '#f4f4f1', 'off white': '#eeebe2', cream: '#efe6cf', ivory: '#f2ecd8', beige: '#d8cbb2', tan: '#c7ad86', greige: '#b9b2a6',
  gray: '#8e9399', grey: '#8e9399', 'light gray': '#c4c7cb', 'light grey': '#c4c7cb', charcoal: '#3b3f45', black: '#1d1f22',
  navy: '#22324d', blue: '#3e6a9c', 'sky blue': '#8db6d8', green: '#4f6b4a', sage: '#9caf88', olive: '#6b6a3a',
  red: '#9b2f2a', brick: '#9a4b36', brown: '#6b4a32', bronze: '#5a4632', terracotta: '#b5603c', yellow: '#e2c25b',
};

export function categoryForSurface(surface) {
  return Object.entries(CATEGORIES).filter(([, c]) => c.surfaces.includes(surface)).map(([id]) => id);
}

export function materialsFor(surface) {
  const cats = categoryForSurface(surface);
  return Object.entries(MATERIALS).filter(([, m]) => cats.includes(m.category)).map(([id, m]) => ({ id, ...m }));
}

export function materialAllowed(materialId, surface) {
  const m = MATERIALS[materialId];
  return !!m && categoryForSurface(surface).includes(m.category);
}

export function normalizeColor(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return COLORS[v] || null;
}
