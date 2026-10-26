import { BuildingModel } from '../../building-model';
import { Target } from '../command-schema';

// Target → element ids, the same rules as the studio's resolveTarget (site/.../core/commands.js).
export function resolveTarget(m: BuildingModel, target: Target, selection: string | null): string[] {
  if ('id' in target) return m.find(target.id) ? [target.id] : [];
  const floor = target.floor === 1 ? 'f1' : target.floor === 2 ? 'f2' : target.floor;
  const norm = (s: unknown) => String(s ?? '').toLowerCase();
  const byFloor = (el: { floor: string }) => !floor || el.floor === floor;
  const byName = (el: { name: string; type?: string }) => !target.name || norm(el.name).includes(norm(target.name)) || norm(el.type).includes(norm(target.name));
  const byFace = (w: { face?: string | null }) => !target.face || w.face === target.face;
  switch (target.kind) {
    case 'selected': return selection && m.find(selection) ? [selection] : [];
    case 'roof': return m.roofs.map(r => r.id);
    case 'exterior-walls': return m.walls.filter(w => w.exterior && byFloor(w) && byFace(w)).map(w => w.id);
    case 'interior-walls': return m.walls.filter(w => !w.exterior && byFloor(w) && byName(w)).map(w => w.id);
    case 'wall': return m.walls.filter(w => byFloor(w) && byFace(w) && byName(w) && (target.face ? w.exterior : true)).map(w => w.id);
    case 'window': case 'door': case 'opening': {
      const walls = new Map(m.walls.map(w => [w.id, w]));
      return m.openings.filter(o => (target.kind === 'opening' || o.kind === target.kind) && (!target.face || walls.get(o.wall)?.face === target.face)
        && (!floor || walls.get(o.wall)?.floor === floor) && byName(o)).map(o => o.id);
    }
    case 'room': return m.rooms.filter(r => byFloor(r) && byName(r)).map(r => r.id);
    case 'cabinet': case 'countertop': return m.components.filter(c => c.kind === target.kind && byName(c)).map(c => c.id);
    case 'component': return m.components.filter(c => byName(c)).map(c => c.id);
    default: return [];
  }
}
