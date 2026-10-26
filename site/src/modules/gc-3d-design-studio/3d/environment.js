// Image-based lighting without downloading HDRI files: a physically based sky (Preetham model, three's Sky shader)
// is rendered for the sun position of each lighting preset and pre-filtered with PMREM. The result works exactly
// like an HDRI: it lights every PBR material (diffuse + reflections) and is shown as the sky background.
// World frame is z-up (inches), so the sky's "up" is +z.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// elevation/azimuth in degrees; azimuth 0 = +y (behind the house), 90 = +x (east). Values tuned for a
// front-facing (−y) house lit from the front-left in daytime.
export const SKIES = {
  day: { elevation: 48, azimuth: 205, turbidity: 2.2, rayleigh: 1.1, mieCoefficient: 0.004, mieDirectionalG: 0.8, exposure: 1.0, env: 0.9, background: true },
  sunset: { elevation: 4, azimuth: 250, turbidity: 6, rayleigh: 2.6, mieCoefficient: 0.006, mieDirectionalG: 0.92, exposure: 0.85, env: 0.75, background: true },
  evening: { elevation: -6, azimuth: 260, turbidity: 8, rayleigh: 3, mieCoefficient: 0.005, mieDirectionalG: 0.9, exposure: 1.1, env: 0.18, background: false },
};

// Unit vector toward the sun in z-up world coordinates.
export function sunDirection(preset) {
  const s = SKIES[preset] || SKIES.day;
  const el = THREE.MathUtils.degToRad(s.elevation), az = THREE.MathUtils.degToRad(s.azimuth);
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az), Math.sin(el));
}

export class SkyEnvironment {
  constructor(renderer) {
    this.renderer = renderer;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.cache = new Map();
  }

  // Returns { texture, background } for a preset; textures are cached (3 presets, ~a few MB each).
  get(preset) {
    if (this.cache.has(preset)) return this.cache.get(preset);
    const s = SKIES[preset] || SKIES.day;
    let texture;
    try {
      const sky = new Sky();
      sky.scale.setScalar(1000);
      const u = sky.material.uniforms;
      u.turbidity.value = s.turbidity; u.rayleigh.value = s.rayleigh;
      u.mieCoefficient.value = s.mieCoefficient; u.mieDirectionalG.value = s.mieDirectionalG;
      u.up.value.set(0, 0, 1);
      u.sunPosition.value.copy(sunDirection(preset));
      const scene = new THREE.Scene(); scene.add(sky);
      // Ground bounce: a dark disc below the horizon so the lower hemisphere isn't sky-bright.
      const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 32), new THREE.MeshBasicMaterial({ color: preset === 'evening' ? '#0c0f14' : '#3d4a33' }));
      ground.position.z = -20; scene.add(ground);
      texture = this.pmrem.fromScene(scene, 0.02, 0.1, 3000).texture;
      sky.geometry.dispose(); sky.material.dispose(); ground.geometry.dispose(); ground.material.dispose();
    } catch {
      // Very old GPUs without float render targets: fall back to the neutral studio environment.
      texture = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    }
    const entry = { texture, background: s.background ? texture : null, settings: s };
    this.cache.set(preset, entry);
    return entry;
  }

  dispose() { for (const e of this.cache.values()) e.texture.dispose(); this.cache.clear(); this.pmrem.dispose(); }
}
