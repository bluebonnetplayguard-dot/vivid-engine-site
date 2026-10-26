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

const scaled = new Map();
export function finishTexture(pattern, scaleInches) {
  const key = `${pattern}@${scaleInches}`;
  if (scaled.has(key)) return scaled.get(key);
  const b = base(pattern);
  if (!b) return null;
  const t = b.clone();
  t.needsUpdate = true;
  t.repeat.set(1 / scaleInches, 1 / scaleInches);
  scaled.set(key, t);
  return t;
}
