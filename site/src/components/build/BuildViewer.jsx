import { useEffect, useRef, useState } from 'react';

// ft-in to 1/16" from millimetres (display only)
export function ftin(mm) {
  let i = Math.round(Math.abs(mm) / 25.4 * 16);
  const ft = Math.floor(i / 192); i -= ft * 192;
  const inch = Math.floor(i / 16); let f = i % 16, d = 16;
  while (f && f % 2 === 0) { f /= 2; d /= 2; }
  const fr = f ? `${f}/${d}` : '';
  const ins = inch ? (fr ? `${inch}-${fr}` : `${inch}`) : (fr || '0');
  return (ft ? `${ft}'-` : '') + ins + '"';
}

// 3D view of a Build Studio model (viewer JSON from the geometry service). three.js loads on demand.
export default function BuildViewer({ viewer, highlight = [], height = 360 }) {
  const box = useRef(null);
  const api = useRef(null);
  const [picked, setPicked] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      let THREE;
      try { THREE = await import('three'); } catch { setFailed(true); return; }
      if (disposed || !box.current) return;
      const el = box.current;
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x07101f);
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, 10, 200000);
      camera.up.set(0, 0, 1);
      scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x223044, 2.2));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-4000, -6000, 9000); scene.add(sun);
      const grid = new THREE.GridHelper(20000, 66, 0x1e3a66, 0x111d36); grid.rotation.x = Math.PI / 2; scene.add(grid);
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x0b1222, transparent: true, opacity: 0.55 });
      const meshes = [];
      for (const elx of viewer.elements) {
        for (const [x0, y0, z0, x1, y1, z1] of elx.boxes) {
          const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
          const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(elx.color), roughness: 0.85 });
          const mesh = new THREE.Mesh(g, m);
          mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
          mesh.userData.el = elx;
          mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), edgeMat));
          scene.add(mesh); meshes.push(mesh);
        }
      }
      const [lo, hi] = viewer.bounds;
      const target = new THREE.Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) * 0.3);
      let rad = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) * 1.9, th = -2.2, ph = 1.05;
      const place = () => { ph = Math.max(0.05, Math.min(Math.PI / 2 - 0.02, ph)); camera.position.set(target.x + rad * Math.sin(ph) * Math.cos(th), target.y + rad * Math.sin(ph) * Math.sin(th), target.z + rad * Math.cos(ph)); camera.lookAt(target); };
      place();
      const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
      const ro = new ResizeObserver(resize); ro.observe(el); resize();
      let drag = null, moved = false;
      const down = e => { drag = { x: e.clientX, y: e.clientY, th, ph }; moved = false; renderer.domElement.setPointerCapture(e.pointerId); };
      const move = e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) moved = true; th = drag.th - dx * 0.006; ph = drag.ph - dy * 0.006; place(); };
      const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
      const up = e => {
        if (drag && !moved) {
          const r = renderer.domElement.getBoundingClientRect();
          mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
          ray.setFromCamera(mouse, camera);
          const hit = ray.intersectObjects(meshes, false)[0];
          meshes.forEach(m => m.material.emissive.setHex(0));
          if (hit) { hit.object.material.emissive.setHex(0x0d3a6a); setPicked(hit.object.userData.el); } else setPicked(null);
        }
        drag = null;
      };
      const wheel = e => { e.preventDefault(); rad *= Math.exp(e.deltaY * 0.001); place(); };
      const c = renderer.domElement;
      c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up);
      c.addEventListener('wheel', wheel, { passive: false });
      let raf = 0;
      const loop = () => { renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
      loop();
      api.current = { meshes };
      cleanup = () => {
        cancelAnimationFrame(raf); ro.disconnect();
        c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('wheel', wheel);
        meshes.forEach(m => { m.geometry.dispose(); m.material.dispose(); });
        renderer.dispose(); c.remove();
      };
    })();
    return () => { disposed = true; cleanup(); };
  }, [viewer]);

  // Highlight elements named by a validation finding.
  useEffect(() => {
    const set = new Set(highlight);
    api.current?.meshes.forEach(m => m.material.emissive.setHex(set.has(m.userData.el.id) ? 0x5a1f26 : 0));
  }, [highlight]);

  if (failed) return <p className="vb-note">The 3D view couldn’t load on this device. The drawings and cut list still work.</p>;
  return <div className="vb-viewer">
    <div ref={box} className="vb-canvas" style={{ height }} role="img" aria-label="3D model. Drag to orbit, scroll to zoom, tap a member to see its details." />
    {picked && <div className="vb-picked">
      <b>{picked.name}</b>
      <span>{[picked.nominal, picked.length, picked.materialName, picked.productionNumber && `#${picked.productionNumber}`].filter(Boolean).join(' · ')}</span>
    </div>}
  </div>;
}
