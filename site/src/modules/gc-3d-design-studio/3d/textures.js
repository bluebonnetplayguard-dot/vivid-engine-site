// Procedural, grayscale finish textures drawn on a canvas once and cached. The material color tints them,
// so changing a color never needs a new texture. UVs are in inches, so repeat = 1 / tile size in inches.
import * as THREE from 'three';

const SIZE = 256;
const cache = new Map();

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const PAINTERS = {
  flat(g) { g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, SIZE, SIZE); },
  noise(g) {
    g.fillStyle = '#ececec'; g.fillRect(0, 0, SIZE, SIZE);
    const r = rng(7);
    for (let i = 0; i < 5000; i++) { const v = 200 + r() * 55 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * SIZE, r() * SIZE, 2, 2); }
  },
  lap(g) {      // 8 courses per tile: shadow line under each board
    g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, SIZE, SIZE);
    const h = SIZE / 8;
    for (let i = 0; i < 8; i++) {
      const y = i * h;
      const grad = g.createLinearGradient(0, y, 0, y + h); grad.addColorStop(0, '#d6d6d6'); grad.addColorStop(0.18, '#f6f6f6'); grad.addColorStop(1, '#ebebeb');
      g.fillStyle = grad; g.fillRect(0, y, SIZE, h);
      g.fillStyle = '#9a9a9a'; g.fillRect(0, y, SIZE, 2);
    }
  },
  batten(g) {
    g.fillStyle = '#f3f3f3'; g.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 4; i++) { const x = i * SIZE / 4; g.fillStyle = '#c8c8c8'; g.fillRect(x, 0, 3, SIZE); g.fillStyle = '#ffffff'; g.fillRect(x + 3, 0, 6, SIZE); g.fillStyle = '#d0d0d0'; g.fillRect(x + 9, 0, 2, SIZE); }
  },
  brick(g) {    // 32" tile: 12 courses of 2-2/3", bricks 8" long -> 4 per row
    g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, SIZE, SIZE);
    const rows = 12, bw = SIZE / 4, bh = SIZE / rows, r = rng(3);
    for (let row = 0; row < rows; row++) for (let i = -1; i < 5; i++) {
      const x = i * bw + (row % 2 ? bw / 2 : 0), v = 205 + r() * 50 | 0;
      g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4);
    }
  },
  stone(g) {
    g.fillStyle = '#a9a9a9'; g.fillRect(0, 0, SIZE, SIZE);
    const r = rng(11); let y = 0;
    while (y < SIZE) { const h = 22 + r() * 30; let x = -r() * 30; while (x < SIZE) { const w = 30 + r() * 60, v = 190 + r() * 60 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.roundRect(x + 3, y + 3, w - 6, h - 6, 6); g.fill(); x += w; } y += h; }
  },
  ribs(g) {
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 4; i++) { const x = i * SIZE / 4; g.fillStyle = '#ffffff'; g.fillRect(x, 0, 10, SIZE); g.fillStyle = '#b5b5b5'; g.fillRect(x + 10, 0, 4, SIZE); }
  },
  seam(g) {
    g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 2; i++) { const x = i * SIZE / 2; g.fillStyle = '#ffffff'; g.fillRect(x, 0, 6, SIZE); g.fillStyle = '#a8a8a8'; g.fillRect(x + 6, 0, 3, SIZE); }
  },
  shingle(g) {  // 60" tile: 12 courses of 5" exposure, tabs with jitter
    g.fillStyle = '#d4d4d4'; g.fillRect(0, 0, SIZE, SIZE);
    const rows = 12, h = SIZE / rows, r = rng(5);
    for (let row = 0; row < rows; row++) {
      let x = -r() * 20;
      while (x < SIZE) { const w = 14 + r() * 26, v = 185 + r() * 70 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, row * h, w - 1.5, h - 2); x += w; }
      g.fillStyle = '#8c8c8c'; g.fillRect(0, row * h + h - 2, SIZE, 2);
    }
  },
  tile(g) {
    g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, SIZE, SIZE);
    const rows = 6, cols = 4, h = SIZE / rows, w = SIZE / cols;
    for (let row = 0; row < rows; row++) for (let c = 0; c < cols; c++) {
      const grad = g.createLinearGradient(c * w, 0, c * w + w, 0); grad.addColorStop(0, '#d9d9d9'); grad.addColorStop(0.5, '#ffffff'); grad.addColorStop(1, '#c4c4c4');
      g.fillStyle = grad; g.fillRect(c * w + 1, row * h + 1, w - 2, h - 3);
    }
  },
  wood(g) {
    g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, SIZE, SIZE);
    const r = rng(9);
    for (let i = 0; i < 70; i++) { const y = r() * SIZE, v = 175 + r() * 60 | 0; g.strokeStyle = `rgba(${v},${v},${v},0.7)`; g.lineWidth = 1 + r() * 2; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(SIZE / 3, y + r() * 8 - 4, 2 * SIZE / 3, y + r() * 8 - 4, SIZE, y); g.stroke(); }
  },
  planks(g) {
    PAINTERS.wood(g);
    const rows = 8, h = SIZE / rows, r = rng(13);
    for (let row = 0; row < rows; row++) { g.fillStyle = '#8f8f8f'; g.fillRect(0, row * h, SIZE, 1.5); const x = r() * SIZE; g.fillRect(x, row * h, 1.5, h); }
  },
  grid(g) {
    g.fillStyle = '#f3f3f3'; g.fillRect(0, 0, SIZE, SIZE);
    g.fillStyle = '#b9b9b9';
    for (let i = 0; i < 2; i++) { g.fillRect(i * SIZE / 2, 0, 2, SIZE); g.fillRect(0, i * SIZE / 2, SIZE, 2); }
  },
};

function base(pattern) {
  if (cache.has(pattern)) return cache.get(pattern);
  let tex = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = c.height = SIZE;
    const g = c.getContext('2d');
    (PAINTERS[pattern] || PAINTERS.flat)(g);
    tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
  }
  cache.set(pattern, tex);
  return tex;
}

// Relief maps for PBR shading, derived from the same painting: the grayscale is read as height, so mortar joints,
// lap shadow lines and standing seams become real normal-map grooves, and recessed areas are a little rougher.
// Built once per pattern; tiny patterns (flat) get none, since a flat normal map only costs a texture fetch.
const RELIEF = { flat: 0, noise: 0.6, lap: 2.2, batten: 2.4, brick: 2.6, stone: 3, ribs: 2.4, seam: 2.8, shingle: 2.2, tile: 2, wood: 0.8, planks: 1.4, grid: 1.6 };
const reliefCache = new Map();

export function heightToNormal(gray, size, strength) {
  // Sobel on a wrapping height field -> tangent-space normal, packed to RGB.
  const out = new Uint8ClampedArray(size * size * 4);
  const at = (x, y) => gray[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1;          // canvas y runs down; texture v runs up
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * size + x) * 4;
    out[i] = (nx * 0.5 + 0.5) * 255; out[i + 1] = (ny * 0.5 + 0.5) * 255; out[i + 2] = (nz * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  return out;
}

function relief(pattern) {
  if (reliefCache.has(pattern)) return reliefCache.get(pattern);
  const strength = RELIEF[pattern] ?? 0;
  let maps = null;
  const b = base(pattern);
  if (b && strength > 0) {
    const src = b.image.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
    const gray = new Float32Array(SIZE * SIZE);
    for (let i = 0; i < gray.length; i++) gray[i] = src[i * 4] / 255;
    const mk = (data) => { const c = document.createElement('canvas'); c.width = c.height = SIZE; c.getContext('2d').putImageData(new ImageData(data, SIZE, SIZE), 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
    const normal = mk(heightToNormal(gray, SIZE, strength));
    // Roughness: 1 in the grooves, the material's own roughness on the faces (the map multiplies material.roughness).
    const rough = new Uint8ClampedArray(SIZE * SIZE * 4);
    for (let i = 0; i < gray.length; i++) { const v = (0.78 + 0.22 * (1 - gray[i])) * 255; rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = v; rough[i * 4 + 3] = 255; }
    maps = { normal, roughness: mk(rough) };
  }
  reliefCache.set(pattern, maps);
  return maps;
}

const scaled = new Map();
function scaledClone(tex, key, scaleInches) {
  if (scaled.has(key)) return scaled.get(key);
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(1 / scaleInches, 1 / scaleInches);
  scaled.set(key, t);
  return t;
}

export function finishTexture(pattern, scaleInches) {
  const b = base(pattern);
  return b ? scaledClone(b, `${pattern}@${scaleInches}`, scaleInches) : null;
}

// Color, normal and roughness maps for one finish at real-world tile size. relief: false skips the extra maps
// (low-quality mode on weak devices).
export function finishMaps(pattern, scaleInches, { relief: withRelief = true } = {}) {
  const map = finishTexture(pattern, scaleInches);
  const r = withRelief ? relief(pattern) : null;
  return {
    map,
    normalMap: r ? scaledClone(r.normal, `${pattern}@${scaleInches}#n`, scaleInches) : null,
    roughnessMap: r ? scaledClone(r.roughness, `${pattern}@${scaleInches}#r`, scaleInches) : null,
  };
}

export const PATTERNS = Object.keys(PAINTERS);
