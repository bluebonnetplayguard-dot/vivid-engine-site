// The interactive 3D viewport: renderer, cameras, orbit and first-person controls, selection, layers,
// view modes (exterior, interior, floor plan, dollhouse cutaway, walkthrough), physically based lighting
// (sky environment, ACES tone mapping, soft shadows fitted to the building), dimension labels, the two-point
// measure tool and presentation-quality image capture. Renders on demand: an idle view costs no GPU time.
// Framework-free so it can be driven by React, by the AI command runner or by tests.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildScene, MaterialBank } from './buildScene.js';
import { createGroundMaterial, createHighlight, QUALITY } from './materialFactory.js';
import { SKIES, SkyEnvironment, sunDirection } from './environment.js';
import { collideWalk, walkLevels } from './walkCollision.js';
import { buildingSummary, findElement, floorById, footprint, polygonArea, polygonBounds, roofGeometry, wallFrame } from '../core/model.js';
import { ftin, sqft } from '../core/units.js';

const EYE = 64;   // eye height, inches
// Direct light and fill per preset. Most of the ambient light now comes from the sky environment (environment.js).
const LIGHTS = {
  day: { fog: '#cfe0ef', ground: '#6f8f5a', hemi: ['#e6f1ff', '#55603f', 0.25], sun: ['#fff6e8', 2.6] },
  sunset: { fog: '#e7b48e', ground: '#5c6a45', hemi: ['#ffd2b0', '#3b3a40', 0.2], sun: ['#ffa760', 2.2] },
  evening: { fog: '#1b2740', ground: '#26331f', hemi: ['#5a6c96', '#141820', 0.35], sun: ['#9db4ff', 0.3], sky: '#141d31' },
};
export const CAMERA_VIEWS = ['front', 'back', 'left', 'right', 'top', 'iso', 'aerial', 'dollhouse', 'ground'];
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const geomKey = model => JSON.stringify([model.walls.map(w => [w.id, w.start, w.end, w.height, w.thickness]), model.openings.map(o => [o.id, o.wall, o.offset, o.width, o.height, o.sill, !!o.door]),
  model.rooms.map(r => [r.id, r.polygon]), model.roofs.map(r => [r.id, r.pitch, r.overhang]), model.components.map(c => [c.id, c.box])]);

export class Viewport {
  constructor(container, { onSelect, onMeasure, onCamera, onStats, lowPower, quality = 'auto' } = {}) {
    this.el = container;
    this.onSelect = onSelect; this.onMeasure = onMeasure; this.onCamera = onCamera; this.onStats = onStats;
    this.lowPower = lowPower ?? (Math.min(window.innerWidth, window.innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4 || window.matchMedia?.('(pointer: coarse)').matches);
    this.qualitySetting = quality;                       // 'auto' | 'high' | 'balanced' | 'low'
    this.quality = quality === 'auto' ? (this.lowPower ? 'low' : 'balanced') : quality;
    this.perf = { frames: 0, t: 0, last: 0, rendered: false, fps: 0, steps: 0 };
    this.needsRender = 2;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false, powerPreference: this.lowPower ? 'low-power' : 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[this.quality].pixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = QUALITY[this.quality].shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'gcs-canvas';
    this.renderer.domElement.setAttribute('aria-label', '3D building model. Drag to rotate, scroll or pinch to zoom, right-drag or two fingers to pan, tap to select.');
    container.appendChild(this.renderer.domElement);
    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'gcs-labels';
    container.appendChild(this.labels.domElement);

    this.scene = new THREE.Scene();
    // Sky-based image lighting (see environment.js): lights PBR materials and is the visible sky.
    this.sky = new SkyEnvironment(this.renderer);
    this.persp = new THREE.PerspectiveCamera(45, 1, 2, 40000);
    this.ortho = new THREE.OrthographicCamera(-500, 500, 500, -500, -40000, 40000);
    for (const c of [this.persp, this.ortho]) c.up.set(0, 0, 1);
    this.camera = this.persp;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => { this.invalidate(); this.onCamera?.(); });
    this.controls.addEventListener('start', () => this.invalidate(30));

    this.hemi = new THREE.HemisphereLight(); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(); this.sun.castShadow = true;
    this.sun.shadow.mapSize.setScalar(QUALITY[this.quality].shadowMap);
    Object.assign(this.sun.shadow.camera, { left: -700, right: 700, top: 700, bottom: -700, near: 10, far: 6000 });
    this.sun.shadow.bias = -0.0002; this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target);
    this.groundMat = createGroundMaterial('#6f8f5a', { quality: this.quality });
    const groundGeo = new THREE.CircleGeometry(6000, 64);
    { const uv = groundGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 12000, uv.getY(i) * 12000); }   // world-size UVs (inches)
    this.ground = new THREE.Mesh(groundGeo, this.groundMat);
    this.ground.position.z = -8.2; this.ground.receiveShadow = true; this.ground.userData.layer = 'ground';
    this.scene.add(this.ground);
    this.grid = new THREE.GridHelper(2400, 100, 0x31517e, 0x9aa9bd); this.grid.rotation.x = Math.PI / 2; this.grid.position.z = -8; this.grid.visible = false;
    this.scene.add(this.grid);
    this.evening = new THREE.Group(); this.scene.add(this.evening);

    this.bank = new MaterialBank({ quality: this.quality });
    this.layers = { roof: true, 'exterior-walls': true, 'interior-walls': true, openings: true, floors: true, cabinets: true, site: true, dimensions: false, grid: false };
    this.mode = 'exterior'; this.floorLimit = null; this.lighting = 'day';
    this.selection = null; this.preview = null;
    this.measure = { active: false, points: [], objects: [] };
    this.walk = { active: false, yaw: 0, pitch: 0, keys: new Set(), level: 1 };
    this.cutaway = '';
    this.dimLabels = [];
    this.anim = null;
    this.setLighting('day');

    this.bindPointer();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(container); this.resize();
    this.disposed = false;
    const loop = t => { if (this.disposed) return; this.raf = requestAnimationFrame(loop); this.tick(t); };
    this.raf = requestAnimationFrame(loop);
    this.onVisibility = () => { if (!document.hidden) { this.perf.last = 0; this.invalidate(); } };
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  // Ask for `frames` more rendered frames (default 1). Anything that changes the picture calls this.
  invalidate(frames = 1) { this.needsRender = Math.max(this.needsRender, frames); }

  // ---------- quality ----------
  // 'auto' picks by device and steps down by itself when frames are slow; the others are fixed.
  setQuality(setting) {
    if (!['auto', 'high', 'balanced', 'low'].includes(setting)) return { error: `Quality must be auto, high, balanced or low.` };
    this.qualitySetting = setting;
    this.applyQuality(setting === 'auto' ? (this.lowPower ? 'low' : 'balanced') : setting);
    return {};
  }

  applyQuality(q) {
    const Q = QUALITY[q];
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.pixelRatio));
    if (this.renderer.shadowMap.enabled !== Q.shadows) { this.renderer.shadowMap.enabled = Q.shadows; this.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); }
    if (this.sun.shadow.mapSize.x !== Q.shadowMap) { this.sun.shadow.mapSize.setScalar(Q.shadowMap); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    const old = this.groundMat; this.groundMat = createGroundMaterial(old.color.getStyle(), { quality: q }); this.ground.material = this.groundMat; old.dispose();
    if (this.bank.setQuality(q) && this.model) { this.geomKey = null; this.setModel(this.model, { preview: this.preview }); }
    this.resize(); this.invalidate();
  }

  stats() {
    const info = this.renderer.info;
    return { quality: this.quality, setting: this.qualitySetting, fps: Math.round(this.perf.fps), drawCalls: info.render.calls, triangles: info.render.triangles,
      geometries: info.memory.geometries, textures: info.memory.textures, pixelRatio: this.renderer.getPixelRatio(), shadows: this.renderer.shadowMap.enabled };
  }

  // ---------- model ----------
  setModel(model, { preview = null } = {}) {
    const key = geomKey(model) + (preview ? `|${preview.join(',')}` : '');
    const rebuild = key !== this.geomKey;
    this.model = model; this.preview = preview;
    if (rebuild || !this.built) {
      if (this.built) { this.scene.remove(this.built.root); this.built.root.traverse(o => o.geometry?.dispose()); }
      this.built = buildScene(model, this.bank);
      this.scene.add(this.built.root);
      this.geomKey = key;
      if (!this.framed) { this.bounds = this.computeBounds(); this.framed = true; this.cameraPreset('iso', { instant: true }); }
      this.bounds = this.computeBounds();
    } else {
      this.refreshMaterials();
    }
    this.fitShadows();
    this.applyVisibility();
    this.applySelection();
    this.refreshDimensions();
    this.invalidate();
  }

  // Shadow camera wrapped tightly around the building (plus room for the cast shadow), so the shadow map's
  // resolution is spent on the house instead of an empty yard: crisp contact shadows, soft PCF edges.
  fitShadows() {
    if (!this.bounds || this.bounds.isEmpty()) return;
    const sphere = this.bounds.getBoundingSphere(new THREE.Sphere());
    const r = sphere.radius * 1.35 + 60;
    const dir = sunDirection(this.lighting);
    this.sun.position.copy(sphere.center).addScaledVector(dir, r * 3);
    this.sun.target.position.copy(sphere.center);
    Object.assign(this.sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: r * 0.5, far: r * 5.5 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.target.updateMatrixWorld();
  }

  refreshMaterials() {
    const fresh = buildScene(this.model, this.bank);
    // Same geometry: copy only material assignments onto the existing meshes, in order.
    const a = this.built.pickables, b = fresh.pickables;
    for (let i = 0; i < a.length && i < b.length; i++) { a[i].material = b[i].material; delete a[i].userData.baseMaterial; }
    fresh.root.traverse(o => o.geometry?.dispose());
  }

  computeBounds() {
    const box = new THREE.Box3();
    this.built.root.traverse(o => { if (o.isMesh && o.userData.layer !== 'site') box.expandByObject(o); });
    return box;
  }

  // ---------- visibility, modes, layers ----------
  setLayer(layer, visible) {
    this.layers[layer] = visible;
    if (layer === 'grid') this.grid.visible = visible;
    this.applyVisibility(); this.refreshDimensions();
  }

  setMode(mode, opts = {}) {
    if (mode === 'perspective' || mode === 'orthographic') return this.setProjection(mode);
    if (this.walk.active && mode !== 'walkthrough') this.stopWalk();
    this.mode = mode;
    this.floorLimit = mode === 'floor' ? (opts.floor === 2 || opts.floor === 'f2' ? 2 : 1) : null;
    if (mode === 'walkthrough') this.startWalk();
    else if (mode === 'dollhouse') this.cameraPreset('dollhouse');
    else if (mode === 'floor') this.cameraPreset('top');
    else if (mode === 'exterior' && opts.reframe) this.cameraPreset('iso');
    this.applyVisibility(); this.refreshDimensions();
  }

  levelOf(floorId) { return this.model ? floorById(this.model, floorId)?.level ?? 1 : 1; }

  isVisible(o) {
    const u = o.userData;
    const L = this.layers;
    if (u.layer === 'gable' && (!L.roof || !L['exterior-walls'])) return false;
    if (u.layer && u.layer !== 'gable' && u.layer !== 'ceiling' && L[u.layer] === false) return false;
    const roofOff = this.mode === 'dollhouse' || this.mode === 'floor' || !L.roof;
    if ((u.layer === 'roof' || u.layer === 'gable' || u.layer === 'ceiling') && roofOff) return false;
    // Dollhouse: exterior walls (with their windows and doors) that face the camera are cut away.
    if (this.mode === 'dollhouse' && u.outward && this.cutawayWalls?.has(u.wallId)) return false;
    if (this.floorLimit && u.floor) {
      const lvl = this.levelOf(u.floor);
      if (lvl > this.floorLimit) return false;
      if (u.ceiling && this.floorLimit < 2) return false;
    }
    return true;
  }

  // Exterior walls facing the camera, for the dollhouse cutaway. Recomputed when the camera moves; visibility
  // is only re-applied when the set changes.
  updateCutaway() {
    if (this.mode !== 'dollhouse' || !this.model) { if (this.cutaway) { this.cutaway = ''; this.cutawayWalls = new Set(); } return false; }
    const v = this.camera.position.clone().sub(this.controls.target); v.z = 0;
    if (v.lengthSq() < 1) return false;
    v.normalize();
    const ids = new Set();
    for (const w of this.model.walls) if (w.exterior) { const n = wallFrame(w).normal; if (n[0] * v.x + n[1] * v.y > 0.3) ids.add(w.id); }
    const key = [...ids].sort().join(',');
    if (key === this.cutaway) return false;
    this.cutaway = key; this.cutawayWalls = ids;
    return true;
  }

  applyVisibility() {
    if (!this.built) return;
    this.updateCutaway();
    this.built.root.traverse(o => { if (o.isMesh) o.visible = this.isVisible(o); });
    // Floor plan: everything is cut 4'-6" above the floor so the plan reads from above.
    const cut = this.mode === 'floor';
    this.renderer.localClippingEnabled = cut;
    const plane = cut ? [new THREE.Plane(new THREE.Vector3(0, 0, -1), (floorById(this.model, `f${this.floorLimit}`)?.elevation ?? 0) + 54)] : [];
    for (const m of this.bank.map.values()) { m.clippingPlanes = plane; m.needsUpdate = true; }
    this.invalidate();
  }

  // ---------- selection ----------
  select(id, { silent } = {}) {
    this.selection = id && this.model && findElement(this.model, id) ? id : null;
    this.applySelection(); this.refreshDimensions();
    if (!silent) this.onSelect?.(this.selection);
  }

  applySelection() {
    if (!this.built) return;
    for (const m of this.built.pickables) {
      const sel = m.userData.id === this.selection, prev = this.preview?.includes(m.userData.id);
      const want = sel ? 'sel' : prev ? 'prev' : null;
      if (m.userData.hl === want) continue;
      if (m.userData.baseMaterial) { const cur = m.material; m.material = m.userData.baseMaterial; [].concat(cur).forEach(c => c !== m.material && c.dispose?.()); delete m.userData.baseMaterial; }
      m.userData.hl = want;
      if (!want) continue;
      m.userData.baseMaterial = m.material;
      const tint = mat => createHighlight(mat, want);
      m.material = Array.isArray(m.material) ? m.material.map(tint) : tint(m.material);
    }
    this.invalidate();
  }

  bindPointer() {
    const c = this.renderer.domElement;
    let down = null;
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2();
    this.onDown = e => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; if (this.walk.active) { this.walk.drag = { x: e.clientX, y: e.clientY, yaw: this.walk.yaw, pitch: this.walk.pitch }; c.setPointerCapture?.(e.pointerId); } };
    this.onMove = e => {
      if (this.walk.active && this.walk.drag) {
        this.walk.yaw = this.walk.drag.yaw - (e.clientX - this.walk.drag.x) * 0.005;
        this.walk.pitch = Math.max(-1.2, Math.min(1.2, this.walk.drag.pitch - (e.clientY - this.walk.drag.y) * 0.005));
        this.applyWalkCamera();
      }
    };
    this.onUp = e => {
      if (this.walk.active) this.walk.drag = null;
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
      down = null;
      if (moved || e.button === 2) return;
      const hit = this.pick(e.clientX, e.clientY);
      if (this.measure.active) { if (hit) this.addMeasurePoint(hit.point); return; }
      this.select(hit?.object.userData.id ?? null);
    };
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('pointermove', this.onMove);
    c.addEventListener('pointerup', this.onUp);
    this.onKey = e => {
      if (!this.walk.active || /input|textarea|select/i.test(document.activeElement?.tagName || '')) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { e.preventDefault(); e.type === 'keydown' ? this.walk.keys.add(k) : this.walk.keys.delete(k); this.invalidate(); }
      else if (e.type === 'keydown' && (k === 'pageup' || k === 'pagedown')) { e.preventDefault(); this.walkFloor(k === 'pageup' ? 1 : -1); }
    };
    this.onBlur = () => this.walk.keys.clear();
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('keydown', this.onKey); window.addEventListener('keyup', this.onKey);
  }

  pick(clientX, clientY) {
    if (!this.built) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.camera.updateMatrixWorld();   // the camera may have moved since the last frame (slow devices)
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const list = this.built.pickables.filter(m => m.visible);
    const hits = this.ray.intersectObjects(list, false);
    if (this.mode === 'floor') { const cut = (floorById(this.model, `f${this.floorLimit}`)?.elevation ?? 0) + 54; return hits.find(h => h.point.z <= cut) || null; }
    return hits[0] || null;
  }

  // ---------- cameras ----------
  pose() { return { position: this.camera.position.toArray(), target: this.controls.target.toArray(), projection: this.camera === this.ortho ? 'orthographic' : 'perspective', zoom: this.camera.zoom }; }
  setPose(p, { instant } = {}) { if (!p?.position) return; if (p.projection && p.projection !== (this.camera === this.ortho ? 'orthographic' : 'perspective')) this.setProjection(p.projection); this.flyTo(new THREE.Vector3(...p.position), new THREE.Vector3(...p.target), { instant }); }

  center() { const c = new THREE.Vector3(); this.bounds.getCenter(c); return c; }
  size() { const s = new THREE.Vector3(); this.bounds.getSize(s); return s; }

  cameraPreset(preset, { instant = false, room, degrees } = {}) {
    if (!this.bounds) return { error: 'No model loaded.' };
    if (this.walk.active && preset !== 'room') this.stopWalk();
    const c = this.center(), s = this.size();
    const R = Math.max(s.x, s.y, s.z) * 1.55 + 240;
    const tgt = new THREE.Vector3(c.x, c.y, Math.min(c.z, 150));
    let pos;
    switch (preset) {
      case 'front': pos = new THREE.Vector3(c.x, this.bounds.min.y - R, 150); break;
      case 'back': pos = new THREE.Vector3(c.x, this.bounds.max.y + R, 150); break;
      case 'left': pos = new THREE.Vector3(this.bounds.min.x - R, c.y, 150); break;
      case 'right': pos = new THREE.Vector3(this.bounds.max.x + R, c.y, 150); break;
      case 'top': pos = new THREE.Vector3(c.x, c.y - 1, R * 1.25); tgt.z = 0; break;
      case 'dollhouse': pos = new THREE.Vector3(c.x + R * 0.35, this.bounds.min.y - R * 0.55, R * 0.95); tgt.z = 100; break;
      case 'ground': pos = new THREE.Vector3(c.x - 120, this.bounds.min.y - R * 0.9, EYE); tgt.z = 130; break;
      case 'aerial': pos = new THREE.Vector3(this.bounds.min.x - R * 0.45, this.bounds.min.y - R * 0.7, R * 1.05); tgt.z = 60; break;
      case 'rotate': {
        const off = this.camera.position.clone().sub(this.controls.target);
        off.applyAxisAngle(new THREE.Vector3(0, 0, 1), -THREE.MathUtils.degToRad(degrees || 45));
        pos = this.controls.target.clone().add(off); return this.flyTo(pos, this.controls.target.clone(), { instant });
      }
      case 'room': return this.roomCamera(room, { instant });
      default: pos = new THREE.Vector3(this.bounds.max.x + R * 0.55, this.bounds.min.y - R * 0.75, R * 0.45);
    }
    return this.flyTo(pos, tgt, { instant });
  }

  roomCamera(name, { instant } = {}) {
    const q = String(name || '').toLowerCase();
    const room = this.model.rooms.find(r => r.name.toLowerCase() === q) || this.model.rooms.find(r => r.name.toLowerCase().includes(q) || r.type === q);
    if (!room) return { error: `There’s no room called “${name}”. Rooms: ${this.model.rooms.map(r => r.name).join(', ')}.` };
    const fl = floorById(this.model, room.floor);
    const b = polygonBounds(room.polygon);
    // Stand in the corner nearest the front door side, look at the far corner.
    const pos = new THREE.Vector3(b.minX + 16, b.minY + 12, fl.elevation + EYE + 6);
    const tgt = new THREE.Vector3((b.minX + b.maxX) / 2 + (b.maxX - b.minX) * 0.2, b.maxY - 10, fl.elevation + 48);
    if (this.mode !== 'interior') { this.mode = 'interior'; this.floorLimit = null; }
    this.floorLimit = fl.level;      // hide the floor above so we're not looking through it
    this.applyVisibility();
    this.select(room.id, { silent: false });
    this.flyTo(pos, tgt, { instant });
    return { room };
  }

  flyTo(pos, tgt, { instant } = {}) {
    if (instant) { this.anim = null; this.camera.position.copy(pos); this.controls.target.copy(tgt); this.syncOrtho(); this.stopDamping(); return {}; }
    this.anim = { t0: performance.now(), dur: 750, p0: this.camera.position.clone(), p1: pos, q0: this.controls.target.clone(), q1: tgt };
    this.invalidate();
    return {};
  }

  // Drop any leftover orbit momentum so a camera jump lands exactly where it was sent.
  // (OrbitControls keeps that momentum in _sphericalDelta/_panOffset; three r171 field names, checked in tests.)
  stopDamping() {
    const c = this.controls;
    c._sphericalDelta?.set(0, 0, 0); c._panOffset?.set(0, 0, 0); if ('_scale' in c) c._scale = 1;
    c.update();
    this.updateCutaway() && this.applyVisibility();
    this.invalidate();
  }

  setProjection(kind) {
    const next = kind === 'orthographic' ? this.ortho : this.persp;
    if (next === this.camera) return;
    next.position.copy(this.camera.position); next.quaternion.copy(this.camera.quaternion);
    this.camera = next; this.controls.object = next; this.syncOrtho(); this.resize(); this.controls.update();
  }

  syncOrtho() {
    if (this.camera !== this.ortho) return;
    const d = this.camera.position.distanceTo(this.controls.target);
    const r = this.el.clientWidth / Math.max(1, this.el.clientHeight);
    const h = d * Math.tan(THREE.MathUtils.degToRad(22.5));
    Object.assign(this.ortho, { left: -h * r, right: h * r, top: h, bottom: -h });
    this.ortho.updateProjectionMatrix();
  }

  // ---------- walkthrough (first person) ----------
  // Starts just outside the front door, eye height 5'-4". Walls block movement (doors let you through);
  // PageUp / PageDown (or the floor buttons) go up and down a level.
  startWalk() {
    const door = this.model.openings.find(o => o.kind === 'door' && /front/i.test(o.name)) || this.model.openings.find(o => o.kind === 'door');
    let start = new THREE.Vector3(this.center().x, this.bounds.min.y - 40, EYE), yaw = Math.PI / 2, level = 1;
    if (door) {
      const wall = this.model.walls.find(w => w.id === door.wall); const f = wallFrame(wall); const fl = floorById(this.model, wall.floor);
      const x = wall.start[0] + f.dir[0] * door.offset + f.normal[0] * 36, y = wall.start[1] + f.dir[1] * door.offset + f.normal[1] * 36;
      start = new THREE.Vector3(x, y, fl.elevation + EYE); yaw = Math.atan2(-f.normal[1], -f.normal[0]); level = fl.level;
    }
    this.walk = { ...this.walk, active: true, yaw, pitch: -0.05, pos: start, keys: new Set(), level };
    this.floorLimit = level; this.controls.enabled = false; this.setProjection('perspective');
    this.applyWalkCamera();
  }
  stopWalk() { this.walk.active = false; this.walk.keys.clear(); this.controls.enabled = true; this.floorLimit = null; this.cameraPreset('iso', { instant: false }); }
  applyWalkCamera() {
    const w = this.walk; if (!w.pos) return;
    this.camera.position.copy(w.pos);
    const dir = new THREE.Vector3(Math.cos(w.yaw) * Math.cos(w.pitch), Math.sin(w.yaw) * Math.cos(w.pitch), Math.sin(w.pitch));
    this.controls.target.copy(w.pos).add(dir.multiplyScalar(60));
    this.camera.lookAt(this.controls.target);
    this.invalidate();
  }
  walkStep(forward, strafe = 0, turn = 0) {
    const w = this.walk; if (!w.active) return { error: 'Walkthrough isn’t on.' };
    w.yaw += turn;
    const f = new THREE.Vector3(Math.cos(w.yaw), Math.sin(w.yaw), 0), r = new THREE.Vector3(Math.sin(w.yaw), -Math.cos(w.yaw), 0);
    const to = w.pos.clone().addScaledVector(f, forward).addScaledVector(r, strafe);
    const fp = footprint(this.model);
    to.x = Math.max(fp.minX - 600, Math.min(fp.maxX + 600, to.x)); to.y = Math.max(fp.minY - 600, Math.min(fp.maxY + 600, to.y));
    // Long steps (button taps) are taken in short sub-steps so a step can't jump through a wall.
    const n = Math.max(1, Math.ceil(Math.hypot(to.x - w.pos.x, to.y - w.pos.y) / 4));
    let blocked = false, cur = [w.pos.x, w.pos.y];
    for (let i = 1; i <= n; i++) {
      const target = [w.pos.x + (to.x - w.pos.x) * i / n, w.pos.y + (to.y - w.pos.y) * i / n];
      const res = this.collisions === false ? { pos: target, blocked: false } : collideWalk(this.model, w.level, cur, target);
      blocked ||= res.blocked; cur = res.pos;
    }
    w.pos.x = cur[0]; w.pos.y = cur[1];
    this.applyWalkCamera();
    return { blocked };
  }
  // Go up (+1) or down (−1) a floor, keeping the plan position.
  walkFloor(delta) {
    const w = this.walk; if (!w.active) return { error: 'Walkthrough isn’t on.' };
    const levels = walkLevels(this.model), i = levels.findIndex(l => l.level === w.level), next = levels[i + delta];
    if (!next) return { error: delta > 0 ? 'This is the top floor.' : 'This is the ground floor.' };
    w.level = next.level; w.pos.z = next.elevation + EYE;
    this.floorLimit = next.level; this.applyVisibility(); this.applyWalkCamera();
    return { level: next.level };
  }

  // ---------- lighting ----------
  setLighting(preset) {
    if (!LIGHTS[preset]) preset = 'day';
    const L = LIGHTS[preset], S = SKIES[preset];
    this.lighting = preset;
    const env = this.sky.get(preset);
    this.scene.environment = env.texture;
    this.scene.background = env.background || new THREE.Color(L.sky);
    this.scene.environmentIntensity = S.env;
    this.scene.backgroundIntensity = 1;
    this.scene.fog = new THREE.Fog(L.fog, 5000, 16000);
    this.groundMat.color.set(L.ground);
    this.hemi.color.set(L.hemi[0]); this.hemi.groundColor.set(L.hemi[1]); this.hemi.intensity = L.hemi[2];
    this.sun.color.set(L.sun[0]); this.sun.intensity = L.sun[1];
    this.fitShadows();
    if (!this.bounds) { const c = new THREE.Vector3(240, 180, 100); this.sun.position.copy(c).addScaledVector(sunDirection(preset), 2500); this.sun.target.position.copy(c); }
    this.renderer.toneMappingExposure = S.exposure;
    // Evening: glowing windows and porch lights.
    this.bank.setEvening(preset === 'evening');
    this.evening.clear();
    if (preset === 'evening' && this.model) {
      const fp = footprint(this.model);
      for (const [x, y] of [[(fp.minX + fp.maxX) / 2, fp.minY - 30], [(fp.minX + fp.maxX) / 2, fp.maxY + 30]]) { const p = new THREE.PointLight('#ffc27a', 4, 600, 1.2); p.position.set(x, y, 100); this.evening.add(p); }
      const inside = new THREE.PointLight('#ffcf8f', 3, 900, 1); inside.position.set((fp.minX + fp.maxX) / 2, (fp.minY + fp.maxY) / 2, 90); this.evening.add(inside);
    }
    if (this.model) { this.geomKey = null; this.setModel(this.model, { preview: this.preview }); }
    this.invalidate();
  }

  // ---------- dimensions and measuring ----------
  label(text, pos, cls = '') {
    const div = document.createElement('div'); div.className = `gcs-dim ${cls}`; div.textContent = text;
    const o = new CSS2DObject(div); o.position.copy(pos); this.scene.add(o); this.dimLabels.push(o); return o;
  }
  clearDimensions() { for (const o of this.dimLabels) { o.element.remove(); this.scene.remove(o); } this.dimLabels = []; this.invalidate(); }

  refreshDimensions() {
    this.clearDimensions();
    if (!this.model || !this.built) return;
    const m = this.model;
    const wallLabel = (w, cls) => {
      const f = wallFrame(w), fl = floorById(m, w.floor);
      const mid = new THREE.Vector3(w.start[0] + f.dir[0] * f.length / 2 + f.normal[0] * 14, w.start[1] + f.dir[1] * f.length / 2 + f.normal[1] * 14, fl.elevation + w.height + 6);
      this.label(ftin(f.length), mid, cls);
    };
    if (this.layers.dimensions) {
      for (const w of m.walls) if (w.exterior && (!this.floorLimit || this.levelOf(w.floor) === this.floorLimit || (this.floorLimit == null && w.floor === 'f1'))) wallLabel(w);
      if (this.mode === 'floor' || this.mode === 'dollhouse') {
        const lvl = this.floorLimit || Math.max(...m.floors.map(f => f.level));
        for (const r of m.rooms) if (this.levelOf(r.floor) === lvl) {
          const b = polygonBounds(r.polygon), fl = floorById(m, r.floor);
          this.label(`${r.name}\n${ftin(b.maxX - b.minX)} × ${ftin(b.maxY - b.minY)} · ${sqft(polygonArea(r.polygon))}`, new THREE.Vector3((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, fl.elevation + 4), 'is-room');
        }
      }
    }
    const hit = this.selection && findElement(m, this.selection);
    if (!hit) return;
    const { el, kind } = hit;
    if (kind === 'wall') wallLabel(el, 'is-sel');
    if (kind === 'opening') {
      const w = m.walls.find(x => x.id === el.wall), f = wallFrame(w), fl = floorById(m, w.floor);
      const at = (u, v, out = 10) => new THREE.Vector3(w.start[0] + f.dir[0] * u + f.normal[0] * out, w.start[1] + f.dir[1] * u + f.normal[1] * out, fl.elevation + v);
      this.label(`W ${ftin(el.width)}`, at(el.offset, el.sill + el.height + 8), 'is-sel');
      this.label(`H ${ftin(el.height)}`, at(el.offset + el.width / 2 + 16, el.sill + el.height / 2), 'is-sel');
      if (el.sill) this.label(`sill ${ftin(el.sill)}`, at(el.offset, Math.max(4, el.sill / 2)), 'is-sel');
    }
    if (kind === 'room') {
      const b = polygonBounds(el.polygon), fl = floorById(m, el.floor);
      this.label(`${ftin(b.maxX - b.minX)} × ${ftin(b.maxY - b.minY)} · ${sqft(polygonArea(el.polygon))}`, new THREE.Vector3((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, fl.elevation + 6), 'is-sel');
    }
    if (kind === 'roof') { const g = roofGeometry(m, el); this.label(`${el.pitch}:12 · ridge ${ftin(g.ridgeZ + el.thickness)}`, new THREE.Vector3((g.fp.minX + g.fp.maxX) / 2, (g.fp.minY + g.fp.maxY) / 2, g.ridgeZ + 30), 'is-sel'); }
    if (kind === 'component') { const [w, d, h] = el.box.s; this.label(`${ftin(w)} × ${ftin(d)} × ${ftin(h)}`, new THREE.Vector3(el.box.c[0], el.box.c[1], el.box.c[2] + h / 2 + 10), 'is-sel'); }
  }

  setMeasuring(on) { this.measure.active = on; this.clearMeasure(); if (on) this.select(null); }
  clearMeasure() { for (const o of this.measure.objects) { if (o.element) o.element.remove(); this.scene.remove(o); o.geometry?.dispose?.(); } this.measure = { ...this.measure, points: [], objects: [] }; }
  addMeasurePoint(p) {
    if (this.measure.points.length >= 2) this.clearMeasure(), (this.measure.active = true);
    this.measure.points.push(p.clone());
    const dot = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffcc33', depthTest: false })); dot.position.copy(p); dot.renderOrder = 10;
    this.scene.add(dot); this.measure.objects.push(dot);
    if (this.measure.points.length === 2) {
      const [a, b] = this.measure.points;
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: '#ffcc33', depthTest: false })); line.renderOrder = 10;
      this.scene.add(line); this.measure.objects.push(line);
      const d = a.distanceTo(b), dz = Math.abs(b.z - a.z), dh = Math.hypot(b.x - a.x, b.y - a.y);
      const div = document.createElement('div'); div.className = 'gcs-dim is-measure'; div.textContent = `${ftin(d)}  (horizontal ${ftin(dh)}, vertical ${ftin(dz)})`;
      const lab = new CSS2DObject(div); lab.position.copy(a.clone().add(b).multiplyScalar(0.5)); this.scene.add(lab); this.measure.objects.push(lab);
      this.onMeasure?.({ distance: d, horizontal: dh, vertical: dz });
    } else this.onMeasure?.({ points: 1 });
    this.invalidate();
  }

  // ---------- capture ----------
  // Renders the current view at presentation size and stamps the conceptual-visualization label on it.
  // For quality the frame is rendered `supersample` times larger with full-size shadows and scaled down, which
  // smooths edges and textures beyond what MSAA alone gives. Returns a data URL (JPEG or PNG).
  capture({ width = 1600, height = 1000, title = '', format = 'jpeg', supersample, label = true } = {}) {
    const r = this.renderer;
    width = Math.max(64, Math.min(4096, Math.round(width))); height = Math.max(64, Math.min(4096, Math.round(height)));
    const maxSide = Math.min(r.capabilities.maxTextureSize || 4096, 8192);
    const ss = Math.max(1, Math.min(supersample ?? (this.quality === 'low' ? 1 : 2), Math.floor(maxSide / Math.max(width, height))));
    const W = width * ss, H = height * ss;
    const oldPR = r.getPixelRatio(), w0 = this.el.clientWidth, h0 = this.el.clientHeight;
    const shadows0 = r.shadowMap.enabled, map0 = this.sun.shadow.mapSize.x;
    const cam = this.camera; const aspect0 = cam.aspect;
    let url;
    try {
      // Presentation shadows even on devices that run without them interactively.
      if (!shadows0) { r.shadowMap.enabled = true; this.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); }
      if (map0 < 4096) { this.sun.shadow.mapSize.setScalar(4096); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
      r.setPixelRatio(1); r.setSize(W, H, false);
      if (cam.isPerspectiveCamera) { cam.aspect = W / H; cam.updateProjectionMatrix(); } else this.syncOrthoAspect(W / H);
      const dims = this.dimLabels.length; if (dims) this.clearDimensions();
      r.render(this.scene, cam);
      const out = document.createElement('canvas'); out.width = width; out.height = height;
      const g = out.getContext('2d');
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(r.domElement, 0, 0, W, H, 0, 0, width, height);
      if (label) {
        const s = buildingSummary(this.model), k = Math.max(0.6, width / 1600);
        g.fillStyle = 'rgba(7,16,31,0.72)'; g.fillRect(0, height - 64 * k, width, 64 * k);
        g.fillStyle = '#ffffff'; g.font = `600 ${Math.round(22 * k)}px system-ui, sans-serif`; g.fillText(title || this.model.name, 24 * k, height - 34 * k);
        g.font = `${Math.round(15 * k)}px system-ui, sans-serif`; g.fillStyle = '#c9d6ea';
        g.fillText(`Design visualization from the 3D model · ${ftin(s.width)} × ${ftin(s.depth)} · ${s.floors} floors · conceptual, not for construction`, 24 * k, height - 12 * k);
      }
      url = format === 'png' ? out.toDataURL('image/png') : out.toDataURL('image/jpeg', 0.92);
    } finally {
      if (!shadows0) { r.shadowMap.enabled = false; this.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); }
      if (map0 < 4096) { this.sun.shadow.mapSize.setScalar(map0); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
      r.setPixelRatio(oldPR); r.setSize(w0, h0, false);
      if (cam.isPerspectiveCamera) { cam.aspect = aspect0; cam.updateProjectionMatrix(); } else this.syncOrtho();
      this.refreshDimensions();
      this.invalidate();
    }
    return url;
  }
  syncOrthoAspect(ar) { const h = this.ortho.top; Object.assign(this.ortho, { left: -h * ar, right: h * ar }); this.ortho.updateProjectionMatrix(); }

  // ---------- loop ----------
  resize() {
    const w = Math.max(1, this.el.clientWidth), h = Math.max(1, this.el.clientHeight);
    this.renderer.setSize(w, h, false); this.labels.setSize(w, h);
    this.persp.aspect = w / h; this.persp.updateProjectionMatrix(); this.syncOrtho();
    this.invalidate();
  }

  // Adaptive quality ('auto' only): measured over rendered frames; when they take too long, step down a level
  // (balanced → low; on low, lower the resolution down to 1x). Idle (not rendering) time isn't counted.
  adapt(now, rendered) {
    const p = this.perf;
    if (rendered && p.rendered && p.last) { p.t += now - p.last; p.frames++; }
    p.last = now; p.rendered = rendered;
    if (p.frames < 45 && !(p.frames >= 4 && p.t > 1500)) return;
    const avg = p.t / p.frames; p.frames = 0; p.t = 0;
    p.fps = 1000 / avg;
    this.onStats?.(this.stats());
    if (this.qualitySetting !== 'auto' || avg <= 45) return;
    p.steps++;
    if (this.quality === 'high') this.applyQuality('balanced');
    else if (this.quality === 'balanced') this.applyQuality('low');
    else { const pr = this.renderer.getPixelRatio(); if (pr > 1) { this.renderer.setPixelRatio(Math.max(1, pr - 0.5)); this.resize(); } }
  }

  tick(now) {
    if (this.anim) {
      const k = Math.min(1, (now - this.anim.t0) / this.anim.dur), e = ease(k);
      this.camera.position.lerpVectors(this.anim.p0, this.anim.p1, e);
      this.controls.target.lerpVectors(this.anim.q0, this.anim.q1, e);
      if (k >= 1) { this.anim = null; this.stopDamping(); this.onCamera?.(); }
      this.syncOrtho();
      this.invalidate();
    }
    if (this.walk.active) {
      const k = this.walk.keys, sp = 4;
      if (k.size) this.walkStep((k.has('w') || k.has('arrowup') ? sp : 0) - (k.has('s') || k.has('arrowdown') ? sp : 0), (k.has('d') ? sp : 0) - (k.has('a') ? sp : 0), (k.has('arrowleft') ? 0.03 : 0) - (k.has('arrowright') ? 0.03 : 0));
    } else if (this.controls.update()) this.invalidate();
    if (this.mode === 'dollhouse' && this.needsRender > 0 && this.updateCutaway()) this.applyVisibility();
    const render = this.needsRender > 0 && !document.hidden;
    this.adapt(now, render);
    if (!render) return;
    this.needsRender--;
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf); this.ro.disconnect();
    const c = this.renderer.domElement;
    c.removeEventListener('pointerdown', this.onDown); c.removeEventListener('pointermove', this.onMove); c.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('keydown', this.onKey); window.removeEventListener('keyup', this.onKey); window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.controls.dispose(); this.clearDimensions(); this.clearMeasure();
    if (this.built) this.built.root.traverse(o => o.geometry?.dispose());
    this.bank.dispose(); this.groundMat.dispose(); this.ground.geometry.dispose(); this.sky.dispose(); this.sun.shadow.map?.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss?.();
    c.remove(); this.labels.domElement.remove();
  }
}

