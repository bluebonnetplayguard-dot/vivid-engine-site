// First-person collision against the building's walls. Pure functions (no three.js, no DOM) so they are tested
// in Node. Units: inches, plan coordinates [x, y].
//
// A wall blocks a step when the body (a circle of `radius`) would come closer to the wall's centerline than
// half its thickness plus the radius, unless the step goes through a door opening wide enough for the body.
// Steps that move AWAY from a wall are always allowed, so the walker can never get stuck inside one.
import { floorById, wallFrame } from '../core/model.js';

export const BODY_RADIUS = 9;   // inches; about shoulder half-width
const DOOR_CLEAR = 2;          // inches kept clear of each jamb when passing through a door

function segmentInfo(wall, p) {
  const f = wallFrame(wall);
  const rx = p[0] - wall.start[0], ry = p[1] - wall.start[1];
  const u = rx * f.dir[0] + ry * f.dir[1];                       // distance along the wall from its start
  const uc = Math.max(0, Math.min(f.length, u));
  const cx = wall.start[0] + f.dir[0] * uc, cy = wall.start[1] + f.dir[1] * uc;
  return { u, dist: Math.hypot(p[0] - cx, p[1] - cy), length: f.length };
}

// Door openings (and open passages taller than a person) on a wall, as [from, to] along the wall.
function passages(model, wall) {
  return model.openings
    .filter(o => o.wall === wall.id && (o.kind === 'door' || o.door) && o.sill <= 2 && o.height >= 72)
    .map(o => [o.offset - o.width / 2 + DOOR_CLEAR, o.offset + o.width / 2 - DOOR_CLEAR]);
}

// Walls that matter on a level (walls belong to floors; level comes from the floor).
export function wallsOnLevel(model, level) {
  return model.walls.filter(w => (floorById(model, w.floor)?.level ?? 1) === level);
}

function blockedBy(model, wall, from, to, radius) {
  const a = segmentInfo(wall, from), b = segmentInfo(wall, to);
  const limit = wall.thickness / 2 + radius;
  if (b.dist >= limit) return false;
  if (b.dist >= a.dist) return false;                    // moving away (or parallel): never trap the walker
  const span = passages(model, wall);
  if (span.some(([l, r]) => b.u - radius >= l && b.u + radius <= r)) return false;   // the body fits through the door
  // Past the wall's ends (around a corner with no connecting wall): not blocked by this wall.
  if (b.u < -radius || b.u > b.length + radius) return false;
  return true;
}

// Returns the position the walker ends up at: the full step, else sliding along x or y, else staying put.
export function collideWalk(model, level, from, to, { radius = BODY_RADIUS } = {}) {
  const walls = wallsOnLevel(model, level);
  const free = p => !walls.some(w => blockedBy(model, w, from, p, radius));
  if (free(to)) return { pos: to, blocked: false };
  const slideX = [to[0], from[1]], slideY = [from[0], to[1]];
  if (Math.abs(to[0] - from[0]) > 1e-6 && free(slideX)) return { pos: slideX, blocked: true };
  if (Math.abs(to[1] - from[1]) > 1e-6 && free(slideY)) return { pos: slideY, blocked: true };
  return { pos: from, blocked: true };
}

// Levels the walker can go to, lowest first: [{ level, elevation, id }].
export function walkLevels(model) {
  return [...model.floors].sort((a, b) => a.level - b.level).map(f => ({ level: f.level, elevation: f.elevation, id: f.id }));
}
