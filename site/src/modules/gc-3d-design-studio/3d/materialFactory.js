// PBR material factories. One place decides how a finish from the material library becomes a three.js material,
// so every surface (walls, roofs, glass, trim, highlights) is shaded consistently and quality settings apply
// everywhere. Values are physically based: albedo from the finish color, roughness/metalness from the library,
// relief (normal + roughness maps) from the procedural texture, reflections from the scene environment.
import * as THREE from 'three';
import { MATERIALS } from '../core/materials.js';
import { finishMaps } from './textures.js';

export const QUALITY = {
  high: { relief: true, physical: true, shadowMap: 4096, pixelRatio: 2, shadows: true },
  balanced: { relief: true, physical: false, shadowMap: 2048, pixelRatio: 1.5, shadows: true },
  low: { relief: false, physical: false, shadowMap: 1024, pixelRatio: 1, shadows: false },
};

const FALLBACK = { color: '#cccccc', pattern: 'flat', scale: 48, roughness: 0.8 };

// Which finishes get a clear lacquer layer (factory-coated metal, polished stone) when quality allows it.
const CLEARCOAT = { 'standing-seam': 0.6, 'metal-panel': 0.5, 'steel-door': 0.4, 'quartz-white': 0.8, 'granite-black': 0.9, 'aluminum-frame': 0.4 };

// Normal-map strength in shading space, per finish category (relief is subtler on smooth interior finishes).
const NORMAL_SCALE = { siding: 1, roofing: 1, hardscape: 0.9, flooring: 0.5, interior: 0.35, cabinet: 0.3, countertop: 0.25, trim: 0.3, door: 0.4 };

export function materialDef(materialId) { return MATERIALS[materialId] || FALLBACK; }

// A surface finish from the library (vinyl siding, shingles, oak floor ...), tinted with an optional custom color.
export function createSurfaceMaterial(materialId, { color, quality = 'balanced' } = {}) {
  const q = QUALITY[quality] || QUALITY.balanced;
  const def = materialDef(materialId);
  const maps = finishMaps(def.pattern, def.scale, { relief: q.relief });
  const coat = q.physical ? CLEARCOAT[materialId] : 0;
  const params = {
    color: new THREE.Color(color || def.color),
    roughness: def.roughness ?? 0.8,
    metalness: def.metalness ?? 0,
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
  };
  const mat = coat ? new THREE.MeshPhysicalMaterial({ ...params, clearcoat: coat, clearcoatRoughness: 0.35 }) : new THREE.MeshStandardMaterial(params);
  if (mat.normalMap) { const s = NORMAL_SCALE[def.category] ?? 0.6; mat.normalScale.set(s, s); }
  // Metals reflect their environment in their own color; keep a little diffuse so dark metal never goes black.
  if (params.metalness > 0) mat.envMapIntensity = 1.25;
  if (def.opacity != null) { mat.transparent = true; mat.opacity = def.opacity; mat.depthWrite = false; }
  mat.name = materialId;
  mat.userData.materialId = materialId;
  return mat;
}

// Window glass: thin, reflective, slightly tinted. In the evening it glows as if the lights are on inside.
export function createGlassMaterial({ evening = false, quality = 'balanced' } = {}) {
  const q = QUALITY[quality] || QUALITY.balanced;
  const common = { side: THREE.DoubleSide, depthWrite: false, transparent: true };
  if (evening) {
    return new THREE.MeshStandardMaterial({ ...common, color: '#ffd9a0', emissive: new THREE.Color('#ffb85c'), emissiveIntensity: 0.9, roughness: 0.2, opacity: 0.92, name: 'glass-evening' });
  }
  // Physical glass: strong Fresnel reflection via specular/IOR, low opacity so interiors read through.
  if (q.physical) return new THREE.MeshPhysicalMaterial({ ...common, color: '#a9c8dc', roughness: 0.04, metalness: 0, ior: 1.52, specularIntensity: 1, reflectivity: 0.6, opacity: 0.38, envMapIntensity: 1.4, name: 'glass' });
  return new THREE.MeshStandardMaterial({ ...common, color: '#9cc3dc', roughness: 0.05, metalness: 0.1, opacity: 0.42, envMapIntensity: 1.2, name: 'glass' });
}

// Selection / proposed-change highlight: a tinted copy of the base material (keeps its texture and relief).
export function createHighlight(base, kind) {
  const c = base.clone();
  if (c.emissive) { c.emissive.set(kind === 'sel' ? '#2f7de1' : '#e1a92f'); c.emissiveIntensity = kind === 'sel' ? 0.32 : 0.4; }
  c.userData = { ...base.userData, highlight: kind };
  return c;
}

// Site ground: grass-like rough surface tinted per lighting preset.
export function createGroundMaterial(color = '#6f8f5a', { quality = 'balanced' } = {}) {
  const q = QUALITY[quality] || QUALITY.balanced;
  const maps = finishMaps('noise', 60, { relief: q.relief });
  return new THREE.MeshStandardMaterial({ color, roughness: 1, map: maps.map, normalMap: maps.normalMap, name: 'ground' });
}
