// Structured building model -> three.js objects. Every mesh carries userData { id, surface, layer, floor }
// so selection, layers and material edits map straight back to model elements.
// Frame: inches, z up (camera.up is set to +z in the viewport).
import * as THREE from 'three';
import { floorById, openingsOn, roofGeometry, wallFrame } from '../core/model.js';
import { materialOf } from '../core/commands.js';
import { createGlassMaterial, createSurfaceMaterial } from './materialFactory.js';

const GLASS = '__glass';

// Shared materials keyed by material id + color, so a color change re-uses or creates one material.
// Materials come from the PBR factories; changing quality or evening mode rebuilds them on next use.
export class MaterialBank {
  constructor({ quality = 'balanced' } = {}) { this.map = new Map(); this.evening = false; this.quality = quality; }
  get(materialId, color) {
    const key = `${materialId}|${color || ''}|${materialId === GLASS && this.evening ? 'e' : ''}|${this.quality}`;
    if (this.map.has(key)) return this.map.get(key);
    const mat = materialId === GLASS ? createGlassMaterial({ evening: this.evening, quality: this.quality }) : createSurfaceMaterial(materialId, { color, quality: this.quality });
    this.map.set(key, mat);
    return mat;
  }
  setEvening(on) { this.evening = !!on; }
  // Different quality → new materials; old ones are disposed (textures are shared and cached, so they stay).
  setQuality(q) { if (q === this.quality) return false; this.quality = q; this.dispose(); return true; }
  dispose() { for (const m of this.map.values()) m.dispose(); this.map.clear(); }
}

// Box with world-scale UVs (inches) and v running up on vertical faces.
export function makeBox(w, d, h) {
  const g = new THREE.BoxGeometry(w, d, h);
  const uv = g.attributes.uv;
  for (let face = 0; face < 6; face++) for (let k = 0; k < 4; k++) {
    const i = face * 4 + k, u = uv.getX(i), v = uv.getY(i);
    if (face < 2) uv.setXY(i, v * d, u * h);          // ±x faces: u along y, v along z
    else if (face < 4) uv.setXY(i, u * w, v * h);     // ±y faces: u along x, v along z
    else uv.setXY(i, u * w, v * d);                   // ±z faces: u along x, v along y
  }
  return g;
}

// Extruded wall slab with openings cut through. Groups: 0 = outer face (+z local), 1 = inner face, 2 = edges.
function wallGeometry(shape, thickness) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  g.translate(0, 0, -thickness / 2);
  const src = g.index ? g.toNonIndexed() : g;
  const pos = src.attributes.position, nor = src.attributes.normal, uv = src.attributes.uv;
  const buckets = [[], [], []];
  for (let t = 0; t < pos.count / 3; t++) {
    const nz = nor.getZ(t * 3);
    buckets[nz > 0.5 ? 0 : nz < -0.5 ? 1 : 2].push(t);
  }
  const out = new THREE.BufferGeometry();
  const P = [], N = [], U = [];
  let start = 0;
  buckets.forEach((tris, gi) => {
    for (const t of tris) for (let k = 0; k < 3; k++) {
      const i = t * 3 + k;
      P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); N.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      if (gi === 2) U.push(pos.getX(i) + pos.getZ(i), pos.getY(i)); else U.push(uv.getX(i), uv.getY(i));
    }
    out.addGroup(start, tris.length * 3, gi); start += tris.length * 3;
  });
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.dispose(); if (src !== g) src.dispose();
  return out;
}

// Local wall frame: x along the wall, y up, z outward. Returns a matrix to world.
function wallMatrix(wall, z0) {
  const { dir, normal } = wallFrame(wall);
  const m = new THREE.Matrix4();
  m.makeBasis(new THREE.Vector3(dir[0], dir[1], 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(normal[0], normal[1], 0));
  m.setPosition(wall.start[0], wall.start[1], z0);
  return m;
}

function tag(obj, data) { obj.userData = { ...obj.userData, ...data }; return obj; }

export function buildScene(model, bank) {
  const root = new THREE.Group();
  root.name = 'building';
  const pickables = [];
  const byId = new Map();
  const add = (parent, mesh, data) => {
    tag(mesh, data);
    mesh.castShadow = data.layer !== 'site' && data.layer !== 'floors';
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (data.id) { pickables.push(mesh); if (!byId.has(data.id)) byId.set(data.id, []); byId.get(data.id).push(mesh); }
    return mesh;
  };
  const surfaceMat = (el, surface) => { const m = materialOf(el, surface); return bank.get(m.material, m.color); };

  // Walls and their openings
  for (const wall of model.walls) {
    const fl = floorById(model, wall.floor);
    const { length, normal } = wallFrame(wall);
    // Exterior pieces carry their outward normal so the dollhouse view can cut away the walls facing the camera.
    const cut = wall.exterior ? { outward: [normal[0], normal[1]], wallId: wall.id } : {};
    const ext = wall.exterior ? wall.thickness / 2 : 0;
    const shape = new THREE.Shape([new THREE.Vector2(-ext, 0), new THREE.Vector2(length + ext, 0), new THREE.Vector2(length + ext, wall.height), new THREE.Vector2(-ext, wall.height)]);
    const ops = openingsOn(model, wall.id);
    for (const o of ops) {
      const l = o.offset - o.width / 2, r = o.offset + o.width / 2;
      shape.holes.push(new THREE.Path([new THREE.Vector2(l, o.sill), new THREE.Vector2(l, o.sill + o.height), new THREE.Vector2(r, o.sill + o.height), new THREE.Vector2(r, o.sill)]));
    }
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    group.matrix.copy(wallMatrix(wall, fl.elevation));
    root.add(group);
    const layer = wall.exterior ? 'exterior-walls' : 'interior-walls';
    const outer = wall.exterior ? surfaceMat(wall, 'wall.exterior') : surfaceMat(wall, 'wall.interior');
    const inner = surfaceMat(wall, 'wall.interior');
    const edge = bank.get('drywall');
    add(group, new THREE.Mesh(wallGeometry(shape, wall.thickness), [outer, inner, edge]), { id: wall.id, surface: wall.exterior ? 'wall.exterior' : 'wall.interior', layer, floor: wall.floor, kind: 'wall', ...cut });

    for (const o of ops) addOpening(group, wall, o, add, surfaceMat, bank, cut);
  }

  // Gable ends, roof slabs and the top-floor ceiling
  for (const roof of model.roofs) {
    const g = roofGeometry(model, roof);
    const fl = floorById(model, roof.floor);
    const mat = surfaceMat(roof, 'roof');
    const { fp, base, rise, angle, ridgeLen, slopeLen, run } = g;
    const cx = (fp.minX + fp.maxX) / 2, cy = (fp.minY + fp.maxY) / 2;
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(makeBox(ridgeLen, slopeLen, roof.thickness), mat);
      const eaveY = side < 0 ? fp.minY - roof.overhang : fp.maxY + roof.overhang;
      const eaveZ = base - roof.overhang * roof.pitch / 12;
      const midY = (eaveY + cy) / 2, midZ = (eaveZ + base + rise) / 2;
      const rot = side < 0 ? angle : -angle;
      mesh.rotation.set(rot, 0, 0);
      const nY = -Math.sin(rot), nZ = Math.cos(rot);
      mesh.position.set(cx, midY + nY * roof.thickness / 2, midZ + nZ * roof.thickness / 2);
      add(root, mesh, { id: roof.id, surface: 'roof', layer: 'roof', floor: roof.floor, kind: 'roof' });
    }
    // Gables: the exterior walls perpendicular to the ridge get a triangle up to the roof.
    for (const wall of model.walls.filter(w => w.exterior && w.floor === roof.floor && (w.face === 'left' || w.face === 'right'))) {
      const { length, normal } = wallFrame(wall);
      const t = wall.thickness;
      const shape = new THREE.Shape([new THREE.Vector2(-t / 2, 0), new THREE.Vector2(length + t / 2, 0), new THREE.Vector2(length / 2, rise * (run - 0) / run)]);
      const grp = new THREE.Group(); grp.matrixAutoUpdate = false; grp.matrix.copy(wallMatrix(wall, fl.elevation + wall.height)); root.add(grp);
      add(grp, new THREE.Mesh(wallGeometry(shape, t), [surfaceMat(wall, 'wall.exterior'), surfaceMat(wall, 'wall.interior'), bank.get('drywall')]),
        { id: wall.id, surface: 'wall.exterior', layer: 'gable', floor: wall.floor, kind: 'wall', outward: [normal[0], normal[1]], wallId: wall.id });
    }
    const ceil = new THREE.Mesh(makeBox(fp.maxX - fp.minX - 6, fp.maxY - fp.minY - 6, 1), bank.get('drywall'));
    ceil.position.set(cx, cy, base + 0.5);
    add(root, ceil, { layer: 'ceiling', floor: roof.floor });
  }

  // Room floors
  for (const room of model.rooms) {
    const fl = floorById(model, room.floor);
    const shape = new THREE.Shape(room.polygon.map(([x, y]) => new THREE.Vector2(x, y)));
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), surfaceMat(room, 'room.floor'));
    mesh.position.z = fl.elevation + 0.1;
    add(root, mesh, { id: room.id, surface: 'room.floor', layer: 'floors', floor: room.floor, kind: 'room' });
  }

  // Components (cabinets, counters, slabs, patio parts)
  for (const c of model.components) {
    const [w, d, h] = c.box.s;
    const mesh = new THREE.Mesh(makeBox(w, d, h), surfaceMat(c, `component.${c.kind}`));
    mesh.position.set(...c.box.c);
    if (c.box.r) mesh.rotation.set(...c.box.r);
    const layer = c.kind === 'cabinet' || c.kind === 'countertop' ? 'cabinets' : c.kind === 'floor-deck' ? 'floors' : 'site';
    add(root, mesh, { id: c.id, surface: `component.${c.kind}`, layer, floor: c.kind === 'floor-deck' ? 'f2' : c.floor, kind: 'component', ceiling: c.kind === 'floor-deck' });
  }

  return { root, pickables, byId };
}

function addOpening(group, wall, o, add, surfaceMat, bank, cut = {}) {
  const t = wall.thickness, l = o.offset - o.width / 2, r = o.offset + o.width / 2, b = o.sill, top = o.sill + o.height;
  const frameMat = surfaceMat(o, 'opening.frame');
  const fw = 2.5, fd = Math.min(t, 4.5);
  const base = { id: o.id, layer: 'openings', floor: wall.floor, kind: 'opening', ...cut };
  const faces = wall.exterior ? [t / 2 - fd / 2 + 0.75] : [t / 2 - fd / 2 + 0.6, -(t / 2 - fd / 2 + 0.6)];
  for (const z of faces) {
    const pieces = [[o.width + 2 * fw, fw, (l + r) / 2, top + fw / 2], [fw, o.height, l - fw / 2, (b + top) / 2], [fw, o.height, r + fw / 2, (b + top) / 2]];
    if (o.kind === 'window') pieces.push([o.width + 2 * fw + 2, 1.5, (l + r) / 2, b - 0.75]);
    for (const [w, h, x, y] of pieces) {
      const m = new THREE.Mesh(makeBox(w, h, fd), frameMat);
      m.position.set(x, y, z);
      add(group, m, { ...base, surface: 'opening.frame' });
    }
  }
  if (o.kind === 'window') {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(o.width, o.height), bank.get(GLASS));
    glass.position.set((l + r) / 2, (b + top) / 2, t / 2 - 2);
    add(group, glass, { ...base, surface: 'glass' });
    if (o.style === 'double-hung' && o.height >= 36) {
      const rail = new THREE.Mesh(makeBox(o.width, 1.5, 1.5), frameMat);
      rail.position.set((l + r) / 2, (b + top) / 2, t / 2 - 1.5);
      add(group, rail, { ...base, surface: 'opening.frame' });
    }
  } else if (o.door) {
    const doorMat = surfaceMat(o, 'opening.door');
    const leaves = o.width > 48 ? 2 : 1;
    for (let i = 0; i < leaves; i++) {
      const w = o.width / leaves - 0.25;
      const m = new THREE.Mesh(makeBox(w, o.height - 0.5, 1.75), doorMat);
      m.position.set(l + w / 2 + i * (o.width / leaves) + 0.125, o.height / 2, wall.exterior ? t / 2 - 2.5 : 0);
      add(group, m, { ...base, surface: 'opening.door' });
    }
    if (o.door !== 'glass-door') {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), bank.get('aluminum-frame', '#c9b27a'));
      knob.position.set(r - 4, 36, (wall.exterior ? t / 2 - 2.5 : 0) + 1.5);
      add(group, knob, { ...base, surface: 'opening.door' });
    }
  }
}
