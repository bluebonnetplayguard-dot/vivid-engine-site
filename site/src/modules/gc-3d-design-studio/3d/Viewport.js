// The interactive 3D viewport: renderer, cameras, orbit and walkthrough controls, selection, layers,
// view modes, lighting presets, dimension labels, the two-point measure tool and image capture.
// Framework-free so it can be driven by React, by the AI command runner or by tests.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildScene, MaterialBank } from './buildScene.js';
import { buildingSummary, findElement, floorById, footprint, polygonArea, polygonBounds, roofGeometry, wallFrame } from '../core/model.js';
import { ftin, sqft } from '../core/units.js';

const EYE = 64;   // eye height, inches
const LIGHTS = {
  day: { sky: '#bfd9f2', ground: '#6f8f5a', hemi: ['#e6f1ff', '#55603f', 0.9], sun: ['#ffffff', 2.4], sunDir: [-0.45, -0.75, 0.6], exposure: 1.0, env: 0.55 },
  sunset: { sky: '#f0a979', ground: '#5c6a45', hemi: ['#ffd2b0', '#3b3a40', 0.6], sun: ['#ffae6b', 2.4], sunDir: [-0.85, -0.45, 0.18], exposure: 0.95, env: 0.35 },
  evening: { sky: '#1b2740', ground: '#26331f', hemi: ['#5a6c96', '#141820', 0.4], sun: ['#9db4ff', 0.35], sunDir: [0.4, -0.6, 0.5], exposure: 1.1, env: 0.12 },
};
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const geomKey = model => JSON.stringify([model.walls.map(w => [w.id, w.start, w.end, w.height, w.thickness]), model.openings.map(o => [o.id, o.wall, o.offset, o.width, o.height, o.sill, !!o.door]),
  model.rooms.map(r => [r.id, r.polygon]), model.roofs.map(r => [r.id, r.pitch, r.overhang]), model.components.map(c => [c.id, c.box])]);

export class Viewport {
  constructor(container, { onSelect, onMeasure, onCamera, lowPower } = {}) {
    this.el = container;
    this.onSelect = onSelect; this.onMeasure = onMeasure; this.onCamera = onCamera;
    this.lowPower = lowPower ?? (Math.min(window.innerWidth, window.innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4 || window.matchMedia?.('(pointer: coarse)').matches);
    this.perf = { frames: 0, t: 0, last: 0 };
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.lowPower ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = !this.lowPower;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'gcs-canvas';
    this.renderer.domElement.setAttribute('aria-label', '3D building model. Drag to rotate, scroll or pinch to zoom, right-drag or two fingers to pan, tap to select.');
    container.appendChild(this.renderer.domElement);
    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'gcs-labels';
    container.appendChild(this.labels.domElement);

    this.scene = new THREE.Scene();
    // Soft studio reflections so metal roofs, glass and dark finishes read as surfaces, not silhouettes.
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.persp = new THREE.PerspectiveCamera(45, 1, 2, 40000);
    this.ortho = new THREE.OrthographicCamera(-500, 500, 500, -500, -40000, 40000);
    for (const c of [this.persp, this.ortho]) c.up.set(0, 0, 1);
    this.camera = this.persp;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => this.onCamera?.());

    this.hemi = new THREE.HemisphereLight(); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -700, right: 700, top: 700, bottom: -700, near: 10, far: 6000 });
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun, this.sun.target);
    this.groundMat = new THREE.MeshStandardMaterial({ color: '#6f8f5a', roughness: 1 });
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(6000, 64), this.groundMat);
    this.ground.position.z = -8.2; this.ground.receiveShadow = true; this.ground.userData.layer = 'ground';
    this.scene.add(this.ground);
    this.grid = new THREE.GridHelper(2400, 100, 0x31517e, 0x9aa9bd); this.grid.rotation.x = Math.PI / 2; this.grid.position.z = -8; this.grid.visible = false;
    this.scene.add(this.grid);
    this.evening = new THREE.Group(); this.scene.add(this.evening);

    this.bank = new MaterialBank();
    this.layers = { roof: true, 'exterior-walls': true, 'interior-walls': true, openings: true, floors: true, cabinets: true, site: true, dimensions: false, grid: false };
    this.mode = 'exterior'; this.floorLimit = null; this.lighting = 'day';
    this.selection = null; this.preview = null;
    this.measure = { active: false, points: [], objects: [] };
    this.walk = { active: false, yaw: 0, pitch: 0, keys: new Set() };
    this.dimLabels = [];
    this.anim = null;
    this.setLighting('day');

    this.bindPointer();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(container); this.resize();
    this.disposed = false;
    const loop = t => { if (this.disposed) return; this.raf = requestAnimationFrame(loop); this.tick(t); };
    this.raf = requestAnimationFrame(loop);
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
    this.applyVisibility();
    this.applySelection();
    this.refreshDimensions();
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
    if (this.floorLimit && u.floor) {
      const lvl = this.levelOf(u.floor);
      if (lvl > this.floorLimit) return false;
      if (u.ceiling && this.floorLimit < 2) return false;
    }
    return true;
  }

  applyVisibility() {
    if (!this.built) return;
    this.built.root.traverse(o => { if (o.isMesh) o.visible = this.isVisible(o); });
    // Floor plan: everything is cut 4'-6" above the floor so the plan reads from above.
    const cut = this.mode === 'floor';
    this.renderer.localClippingEnabled = cut;
    const plane = cut ? [new THREE.Plane(new THREE.Vector3(0, 0, -1), (floorById(this.model, `f${this.floorLimit}`)?.elevation ?? 0) + 54)] : [];
    for (const m of this.bank.map.values()) { m.clippingPlanes = plane; m.needsUpdate = true; }
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
      const tint = mat => { const c = mat.clone(); if (c.emissive) { c.emissive.set(want === 'sel' ? '#2f7de1' : '#e1a92f'); c.emissiveIntensity = want === 'sel' ? 0.32 : 0.4; } return c; };
      m.material = Array.isArray(m.material) ? m.material.map(tint) : tint(m.material);
    }
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
    this.onKey = e => { if (!this.walk.active || /input|textarea/i.test(document.activeElement?.tagName || '')) return; const k = e.key.toLowerCase(); if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { e.preventDefault(); e.type === 'keydown' ? this.walk.keys.add(k) : this.walk.keys.delete(k); } };
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
    if (instant) { this.camera.position.copy(pos); this.controls.target.copy(tgt); this.syncOrtho(); this.stopDamping(); return {}; }
    this.anim = { t0: performance.now(), dur: 750, p0: this.camera.position.clone(), p1: pos, q0: this.controls.target.clone(), q1: tgt };
    return {};
  }

  // Drop any leftover orbit momentum so a camera jump lands exactly where it was sent.
  // (OrbitControls keeps that momentum in _sphericalDelta/_panOffset; three r171 field names, checked in tests.)
  stopDamping() {
    const c = this.controls;
    c._sphericalDelta?.set(0, 0, 0); c._panOffset?.set(0, 0, 0); if ('_scale' in c) c._scale = 1;
    c.update();
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

  // ---------- walkthrough ----------
  startWalk() {
    const door = this.model.openings.find(o => o.kind === 'door' && /front/i.test(o.name)) || this.model.openings.find(o => o.kind === 'door');
    let start = new THREE.Vector3(this.center().x, this.bounds.min.y + 40, EYE), yaw = Math.PI / 2;
    if (door) {
      const wall = this.model.walls.find(w => w.id === door.wall); const f = wallFrame(wall);
      const x = wall.start[0] + f.dir[0] * door.offset - f.normal[0] * 36, y = wall.start[1] + f.dir[1] * door.offset - f.normal[1] * 36;
      start = new THREE.Vector3(x, y, floorById(this.model, wall.floor).elevation + EYE); yaw = Math.atan2(-f.normal[1], -f.normal[0]);
    }
    this.walk = { ...this.walk, active: true, yaw, pitch: -0.05, pos: start, keys: new Set() };
    this.floorLimit = 1; this.controls.enabled = false; this.setProjection('perspective');
    this.applyWalkCamera();
  }
  stopWalk() { this.walk.active = false; this.controls.enabled = true; this.floorLimit = null; this.cameraPreset('iso', { instant: false }); }
  applyWalkCamera() {
    const w = this.walk; if (!w.pos) return;
    this.camera.position.copy(w.pos);
    const dir = new THREE.Vector3(Math.cos(w.yaw) * Math.cos(w.pitch), Math.sin(w.yaw) * Math.cos(w.pitch), Math.sin(w.pitch));
    this.controls.target.copy(w.pos).add(dir.multiplyScalar(60));
    this.camera.lookAt(this.controls.target);
  }
  walkStep(forward, strafe = 0, turn = 0) {
    const w = this.walk; if (!w.active) return;
    w.yaw += turn;
    const f = new THREE.Vector3(Math.cos(w.yaw), Math.sin(w.yaw), 0), r = new THREE.Vector3(Math.sin(w.yaw), -Math.cos(w.yaw), 0);
    w.pos.addScaledVector(f, forward).addScaledVector(r, strafe);
    const fp = footprint(this.model);
    w.pos.x = Math.max(fp.minX - 600, Math.min(fp.maxX + 600, w.pos.x)); w.pos.y = Math.max(fp.minY - 600, Math.min(fp.maxY + 600, w.pos.y));
    this.applyWalkCamera();
  }

  // ---------- lighting ----------
  setLighting(preset) {
    const L = LIGHTS[preset] || LIGHTS.day;
    this.lighting = preset;
    this.scene.background = new THREE.Color(L.sky);
    this.scene.fog = new THREE.Fog(L.sky, 4000, 14000);
    this.groundMat.color.set(L.ground);
    this.hemi.color.set(L.hemi[0]); this.hemi.groundColor.set(L.hemi[1]); this.hemi.intensity = L.hemi[2];
    this.sun.color.set(L.sun[0]); this.sun.intensity = L.sun[1];
    const c = this.bounds ? this.center() : new THREE.Vector3(240, 180, 100);
    this.sun.position.set(c.x + L.sunDir[0] * 2500, c.y + L.sunDir[1] * 2500, L.sunDir[2] * 2500); this.sun.target.position.copy(c);
    this.renderer.toneMappingExposure = L.exposure;
    this.scene.environmentIntensity = L.env;
    // Evening: glowing windows and porch lights.
    this.bank.setEvening(preset === 'evening');
    this.evening.clear();
    if (preset === 'evening' && this.model) {
      const fp = footprint(this.model);
      for (const [x, y] of [[(fp.minX + fp.maxX) / 2, fp.minY - 30], [(fp.minX + fp.maxX) / 2, fp.maxY + 30]]) { const p = new THREE.PointLight('#ffc27a', 4, 600, 1.2); p.position.set(x, y, 100); this.evening.add(p); }
      const inside = new THREE.PointLight('#ffcf8f', 3, 900, 1); inside.position.set((fp.minX + fp.maxX) / 2, (fp.minY + fp.maxY) / 2, 90); this.evening.add(inside);
    }
    if (this.model) { this.geomKey = null; this.setModel(this.model, { preview: this.preview }); }
  }

  // ---------- dimensions and measuring ----------
  label(text, pos, cls = '') {
    const div = document.createElement('div'); div.className = `gcs-dim ${cls}`; div.textContent = text;
    const o = new CSS2DObject(div); o.position.copy(pos); this.scene.add(o); this.dimLabels.push(o); return o;
  }
  clearDimensions() { for (const o of this.dimLabels) { o.element.remove(); this.scene.remove(o); } this.dimLabels = []; }

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
  }

  // ---------- capture ----------
  // Renders the current view at presentation size and stamps the conceptual-visualization label on it.
  capture({ width = 1600, height = 1000, title = '' } = {}) {
    const r = this.renderer, oldPR = r.getPixelRatio(), w0 = this.el.clientWidth, h0 = this.el.clientHeight;
    r.setPixelRatio(1); r.setSize(width, height, false);
    const cam = this.camera; const aspect0 = cam.aspect;
    if (cam.isPerspectiveCamera) { cam.aspect = width / height; cam.updateProjectionMatrix(); } else this.syncOrthoAspect(width / height);
    const dims = this.dimLabels.length; if (dims) this.clearDimensions();
    r.render(this.scene, cam);
    const out = document.createElement('canvas'); out.width = width; out.height = height;
    const g = out.getContext('2d'); g.drawImage(r.domElement, 0, 0, width, height);
    const s = buildingSummary(this.model);
    g.fillStyle = 'rgba(7,16,31,0.72)'; g.fillRect(0, height - 64, width, 64);
    g.fillStyle = '#ffffff'; g.font = '600 22px system-ui, sans-serif'; g.fillText(title || this.model.name, 24, height - 34);
    g.font = '15px system-ui, sans-serif'; g.fillStyle = '#c9d6ea';
    g.fillText(`Design visualization from the 3D model · ${ftin(s.width)} × ${ftin(s.depth)} · ${s.floors} floors · conceptual, not for construction`, 24, height - 12);
    const url = out.toDataURL('image/jpeg', 0.9);
    r.setPixelRatio(oldPR); r.setSize(w0, h0, false);
    if (cam.isPerspectiveCamera) { cam.aspect = aspect0; cam.updateProjectionMatrix(); } else this.syncOrtho();
    this.refreshDimensions();
    return url;
  }
  syncOrthoAspect(ar) { const h = this.ortho.top; Object.assign(this.ortho, { left: -h * ar, right: h * ar }); this.ortho.updateProjectionMatrix(); }

  // ---------- loop ----------
  resize() {
    const w = Math.max(1, this.el.clientWidth), h = Math.max(1, this.el.clientHeight);
    this.renderer.setSize(w, h, false); this.labels.setSize(w, h);
    this.persp.aspect = w / h; this.persp.updateProjectionMatrix(); this.syncOrtho();
  }

  // Adaptive quality: if frames take too long, lower the resolution and switch shadows off (down to 1x).
  adapt(now) {
    const p = this.perf;
    if (p.last) { p.t += now - p.last; p.frames++; }
    p.last = now;
    if (p.frames < 45 && !(p.frames >= 4 && p.t > 1500)) return;
    const avg = p.t / p.frames; p.frames = 0; p.t = 0;
    const pr = this.renderer.getPixelRatio();
    if (avg > 45 && (pr > 1 || this.renderer.shadowMap.enabled)) {
      if (this.renderer.shadowMap.enabled) { this.renderer.shadowMap.enabled = false; this.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); }
      else this.renderer.setPixelRatio(Math.max(1, pr - 0.5));
      this.resize();
    }
  }

  tick(now) {
    this.adapt(now);
    if (this.anim) {
      const k = Math.min(1, (now - this.anim.t0) / this.anim.dur), e = ease(k);
      this.camera.position.lerpVectors(this.anim.p0, this.anim.p1, e);
      this.controls.target.lerpVectors(this.anim.q0, this.anim.q1, e);
      if (k >= 1) { this.anim = null; this.stopDamping(); this.onCamera?.(); }
      this.syncOrtho();
    }
    if (this.walk.active) {
      const k = this.walk.keys, sp = 4;
      if (k.size) this.walkStep((k.has('w') || k.has('arrowup') ? sp : 0) - (k.has('s') || k.has('arrowdown') ? sp : 0), (k.has('d') ? sp : 0) - (k.has('a') ? sp : 0), (k.has('arrowleft') ? 0.03 : 0) - (k.has('arrowright') ? 0.03 : 0));
    } else this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf); this.ro.disconnect();
    const c = this.renderer.domElement;
    c.removeEventListener('pointerdown', this.onDown); c.removeEventListener('pointermove', this.onMove); c.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('keydown', this.onKey); window.removeEventListener('keyup', this.onKey);
    this.controls.dispose(); this.clearDimensions(); this.clearMeasure();
    if (this.built) this.built.root.traverse(o => o.geometry?.dispose());
    this.bank.dispose(); this.scene.environment?.dispose(); this.pmrem.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss?.();
    c.remove(); this.labels.domElement.remove();
  }
}

