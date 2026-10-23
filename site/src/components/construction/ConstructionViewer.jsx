import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ftin } from '@/construction/lumber';

// Live 3D view of a configurator model. One WebGL context for the life of the component;
// the scene is rebuilt when the model changes. three.js loads on demand.
const ConstructionViewer = forwardRef(function ConstructionViewer({ model, hidden, xray, height = 520 }, ref) {
  const box = useRef(null);
  const ctx = useRef(null);
  const [picked, setPicked] = useState(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useImperativeHandle(ref, () => ({
    snapshot: () => { const c = ctx.current; if (!c) return null; c.render(); return c.renderer.domElement.toDataURL('image/png'); },
    resetView: (view) => ctx.current?.frame(true, view),
  }));

  // renderer, camera and controls (once)
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      let THREE;
      try { THREE = await import('three'); } catch { setFailed(true); return; }
      if (disposed || !box.current) return;
      const el = box.current;
      let renderer;
      try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); } catch { setFailed(true); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x07101f);
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 5, 100000);
      camera.up.set(0, 0, 1);
      scene.add(new THREE.HemisphereLight(0xe6efff, 0x2a3446, 2.0));
      const sun = new THREE.DirectionalLight(0xffffff, 1.7); sun.position.set(-3000, -5000, 8000); scene.add(sun);
      const fill = new THREE.DirectionalLight(0x9cc8ff, 0.45); fill.position.set(4000, 3000, 2000); scene.add(fill);
      const grid = new THREE.GridHelper(12000, 100, 0x1e3a66, 0x101b33); grid.rotation.x = Math.PI / 2; grid.position.z = -0.5; scene.add(grid);
      const root = new THREE.Group(); scene.add(root);
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x0b1222, transparent: true, opacity: 0.5 });

      const target = new THREE.Vector3();
      let rad = 800, th = -2.25, ph = 1.08;
      const place = () => {
        ph = Math.max(0.05, Math.min(Math.PI / 2 + 0.25, ph));
        camera.position.set(target.x + rad * Math.sin(ph) * Math.cos(th), target.y + rad * Math.sin(ph) * Math.sin(th), target.z + rad * Math.cos(ph));
        camera.lookAt(target);
      };
      const state = { meshes: [], bounds: null };
      const VIEWS = { iso: [-2.25, 1.08], front: [-Math.PI / 2, Math.PI / 2 - 0.02], side: [Math.PI, Math.PI / 2 - 0.02], top: [-Math.PI / 2, 0.05] };
      const frame = (force, view = 'iso') => {
        if (!state.bounds) return;
        const [lo, hi] = state.bounds;
        const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
        target.set((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2] + (hi[2] - lo[2]) * 0.42);
        if (force || !state.framed) { rad = size * (view === 'iso' ? 2.1 : 2.0); [th, ph] = VIEWS[view] || VIEWS.iso; state.framed = true; }
        place();
      };

      const build = (m) => {
        for (const ms of state.meshes) { ms.geometry.dispose(); ms.material.dispose(); ms.children.forEach(ch => ch.geometry?.dispose()); }
        root.clear(); state.meshes = [];
        for (const e of m.elements) {
          let geo, mesh;
          const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(e.color), roughness: e.material === 'glass' ? 0.1 : 0.82, metalness: ['metalRoof', 'metalSiding', 'steel'].includes(e.material) ? 0.45 : 0, transparent: e.opacity != null, opacity: e.opacity ?? 1, side: THREE.DoubleSide });
          if (e.shape === 'box') {
            geo = new THREE.BoxGeometry(...e.s);
            mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(...e.c); mesh.rotation.set(e.r[0], e.r[1], e.r[2], 'XYZ');
          } else {
            const shape = new THREE.Shape(e.pts.map(([x, y]) => new THREE.Vector2(x, y)));
            for (const h of e.holes || []) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
            geo = new THREE.ExtrudeGeometry(shape, { depth: e.t, bevelEnabled: false });
            mesh = new THREE.Mesh(geo, mat);
            const u = new THREE.Vector3(...e.u), v = new THREE.Vector3(...e.v), n = new THREE.Vector3().crossVectors(u, v);
            mesh.matrixAutoUpdate = false;
            mesh.matrix.makeBasis(u, v, n).setPosition(...e.o);
          }
          if (e.kind === 'lumber' || e.kind === 'concrete') mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
          mesh.userData.el = e;
          root.add(mesh); state.meshes.push(mesh);
        }
        state.bounds = m.bounds();
        frame(false);
      };

      const render = () => renderer.render(scene, camera);
      const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); };
      const ro = new ResizeObserver(resize); ro.observe(el); resize();

      // pointer controls: drag = orbit, right/shift-drag or two fingers = pan, wheel/pinch = zoom
      const pts = new Map();
      let drag = null, moved = false;
      const c = renderer.domElement;
      const panBy = (dx, dy) => {
        const s = rad * 0.0016;
        const right = new THREE.Vector3().subVectors(camera.position, target).cross(camera.up).normalize();
        const upv = new THREE.Vector3().crossVectors(right, new THREE.Vector3().subVectors(target, camera.position)).normalize();
        target.addScaledVector(right, dx * s).addScaledVector(upv, dy * s); place();
      };
      const down = e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); c.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; moved = false; };
      const move = e => {
        if (!pts.has(e.pointerId)) return;
        const prev = pts.get(e.pointerId);
        if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          const d0 = Math.hypot(a.x - b.x, a.y - b.y);
          pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const [a2, b2] = [...pts.values()];
          const d1 = Math.hypot(a2.x - b2.x, a2.y - b2.y);
          if (d0 > 0) { rad *= d0 / d1; }
          panBy((e.clientX - prev.x) / 2, (e.clientY - prev.y) / 2);
          moved = true; return;
        }
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
        if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) moved = true;
        if (drag.pan) panBy(dx, dy); else { th -= dx * 0.006; ph -= dy * 0.006; place(); }
      };
      const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
      const up = e => {
        pts.delete(e.pointerId);
        if (drag && !moved && e.button === 0) {
          const r = c.getBoundingClientRect();
          mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
          ray.setFromCamera(mouse, camera);
          const hit = ray.intersectObjects(state.meshes.filter(ms => ms.visible), false)[0];
          state.meshes.forEach(ms => ms.material.emissive?.setHex(0));
          if (hit) { hit.object.material.emissive.setHex(0x1b4f8f); setPicked(hit.object.userData.el); } else setPicked(null);
        }
        if (!pts.size) drag = null;
      };
      const wheel = e => { e.preventDefault(); rad *= Math.exp(e.deltaY * 0.001); place(); };
      const noMenu = e => e.preventDefault();
      c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
      c.addEventListener('wheel', wheel, { passive: false }); c.addEventListener('contextmenu', noMenu);
      let raf = 0;
      const loop = () => { render(); raf = requestAnimationFrame(loop); };
      loop();
      ctx.current = { THREE, renderer, build, state, frame, render, edgeMat };
      setReady(true);
      cleanup = () => {
        cancelAnimationFrame(raf); ro.disconnect();
        c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up);
        c.removeEventListener('wheel', wheel); c.removeEventListener('contextmenu', noMenu);
        for (const ms of state.meshes) { ms.geometry.dispose(); ms.material.dispose(); ms.children.forEach(ch => ch.geometry?.dispose()); }
        edgeMat.dispose(); grid.geometry.dispose();
        renderer.dispose(); renderer.forceContextLoss(); c.remove();
        ctx.current = null;
      };
    })();
    return () => { disposed = true; cleanup(); };
  }, []);

  // rebuild scene when the model changes
  useEffect(() => { if (ready && model) { ctx.current.build(model); setPicked(null); } }, [ready, model]);

  // layer visibility and x-ray
  useEffect(() => {
    if (!ready) return;
    for (const ms of ctx.current.state.meshes) {
      const e = ms.userData.el;
      ms.visible = !hidden.has(e.group.split(' · ')[0]) && !hidden.has(e.group);
      const base = e.opacity ?? 1;
      const o = xray && e.kind !== 'lumber' ? Math.min(base, 0.18) : base;
      ms.material.transparent = o < 1; ms.material.opacity = o; ms.material.depthWrite = o >= 1;
    }
  }, [ready, model, hidden, xray]);

  if (failed) return <p className="cc-note">The 3D view could not start on this device (WebGL is off or unsupported). The materials list, estimate and exports still work.</p>;
  return <div className="cc-viewer">
    <div ref={box} className="cc-canvas" style={{ height }} role="img" aria-label="3D model. Drag to orbit, right-drag or Shift-drag to pan, scroll or pinch to zoom, click a part to see its details." />
    {picked && <div className="cc-picked" role="status">
      <b>{picked.name}</b>
      <span>{[picked.group, picked.nominal, picked.lengthIn && ftin(picked.lengthIn), picked.material && (picked.kind === 'lumber' ? picked.material.toUpperCase() : null)].filter(Boolean).join(' · ')}</span>
    </div>}
    <div className="cc-hint" aria-hidden="true">Drag to orbit · Right-drag to pan · Scroll to zoom · Click a part</div>
  </div>;
});

export default ConstructionViewer;
