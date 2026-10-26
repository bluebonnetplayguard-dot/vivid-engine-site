// Sample two-story house used until blueprint conversion exists. 40' x 30' footprint, 10' first floor
// (9' ceilings), 8' second floor, 6:12 gable roof. Every size here is a conceptual default, not
// taken from construction documents, so every element is marked dims.status = 'conceptual'.
import { SCHEMA } from './model.js';

const C = { status: 'conceptual' };
const EXT = 6.5, INT = 4.5;

function ring(floor, z, height, prefix) {
  const pts = [[0, 0], [480, 0], [480, 360], [0, 360]];
  const faces = ['front', 'right', 'back', 'left'];
  const label = { front: 'Front', right: 'Right side', back: 'Back', left: 'Left side' };
  return faces.map((face, i) => ({
    id: `${prefix}-${face}`, floor, name: `${label[face]} wall, ${floor === 'f1' ? '1st' : '2nd'} floor`,
    start: pts[i], end: pts[(i + 1) % 4], height, thickness: EXT, exterior: true, face,
    finishExterior: 'vinyl-lap', finishInterior: 'drywall', dims: C,
  }));
}

const wall = (id, floor, name, start, end, height) => ({ id, floor, name, start, end, height, thickness: INT, exterior: false, face: null, finishExterior: 'drywall', finishInterior: 'drywall', dims: C });
const win = (id, wallId, name, offset, width = 48, height = 60, sill = 30) => ({ id, kind: 'window', wall: wallId, name, offset, width, height, sill, frame: 'vinyl-frame', style: 'double-hung', dims: C });
const door = (id, wallId, name, offset, width, door = 'steel-door', height = 80) => ({ id, kind: 'door', wall: wallId, name, offset, width, height, sill: 0, frame: 'vinyl-frame', door, dims: C });
const room = (id, floor, name, type, polygon, floorFinish) => ({ id, floor, name, type, polygon, floorFinish, dims: C });
const box = (id, kind, floor, name, c, s, material, extra = {}) => ({ id, kind, floor, name, box: { c, s }, material, dims: C, ...extra });

export function sampleHouse() {
  return {
    schema: SCHEMA,
    id: 'sample-two-story',
    name: 'Sample two-story house',
    meta: { source: 'sample', notice: 'Sample model for demonstration. Dimensions are conceptual defaults, not taken from construction documents.' },
    floors: [
      { id: 'f1', name: '1st floor', level: 1, elevation: 0, wallHeight: 120, framing: 12 },
      { id: 'f2', name: '2nd floor', level: 2, elevation: 120, wallHeight: 96, framing: 0 },
    ],
    walls: [
      ...ring('f1', 0, 120, 'w1'),
      wall('w1-i1', 'f1', 'Interior wall, living / kitchen', [240, 0], [240, 360], 108),
      wall('w1-i2', 'f1', 'Interior wall, living / family', [0, 210], [240, 210], 108),
      wall('w1-i3', 'f1', 'Interior wall, dining / kitchen', [240, 150], [480, 150], 108),
      ...ring('f2', 120, 96, 'w2'),
      wall('w2-i1', 'f2', 'Interior wall, bedroom 2 / 3', [240, 0], [240, 180], 96),
      wall('w2-i2', 'f2', 'Interior wall, hall', [0, 180], [480, 180], 96),
      wall('w2-i3', 'f2', 'Interior wall, primary / bath', [300, 180], [300, 360], 96),
    ],
    openings: [
      win('o-f1-front-1', 'w1-front', 'Front window (living room)', 70, 60, 60, 30),
      door('o-front-door', 'w1-front', 'Front door', 180, 36),
      win('o-f1-front-2', 'w1-front', 'Front window (dining, left)', 330),
      win('o-f1-front-3', 'w1-front', 'Front window (dining, right)', 410),
      win('o-f1-right-1', 'w1-right', 'Side window (dining)', 75, 36),
      win('o-f1-right-2', 'w1-right', 'Side window (kitchen)', 270, 36),
      win('o-kitchen-sink', 'w1-back', 'Kitchen window over sink', 120, 48, 42, 42),
      door('o-patio-door', 'w1-back', 'Patio door (family room)', 360, 72, 'glass-door'),
      win('o-f1-left-1', 'w1-left', 'Side window (family room)', 75),
      win('o-f1-left-2', 'w1-left', 'Side window (living room)', 255),
      { ...door('o-i1-a', 'w1-i1', 'Cased opening, living to dining', 105, 48, null, 84) },
      { ...door('o-i1-b', 'w1-i1', 'Doorway, family to kitchen', 280, 36, null, 84) },
      { ...door('o-i2-a', 'w1-i2', 'Cased opening, living to family', 120, 60, null, 84) },
      { ...door('o-i3-a', 'w1-i3', 'Cased opening, dining to kitchen', 120, 72, null, 84) },
      win('o-f2-front-1', 'w2-front', 'Front window (bedroom 2, left)', 70, 40, 54, 30),
      win('o-f2-front-2', 'w2-front', 'Front window (bedroom 2, right)', 170, 40, 54, 30),
      win('o-f2-front-3', 'w2-front', 'Front window (bedroom 3, left)', 310, 40, 54, 30),
      win('o-f2-front-4', 'w2-front', 'Front window (bedroom 3, right)', 410, 40, 54, 30),
      win('o-f2-right-1', 'w2-right', 'Side window (bedroom 3)', 90, 36, 54, 30),
      win('o-f2-right-2', 'w2-right', 'Side window (bath)', 270, 30, 30, 54),
      win('o-f2-back-1', 'w2-back', 'Back window (bath)', 90, 30, 30, 54),
      win('o-f2-back-2', 'w2-back', 'Back window (primary, right)', 300, 48, 54, 30),
      win('o-f2-back-3', 'w2-back', 'Back window (primary, left)', 420, 48, 54, 30),
      win('o-f2-left-1', 'w2-left', 'Side window (primary)', 90, 48, 54, 30),
      win('o-f2-left-2', 'w2-left', 'Side window (bedroom 2)', 270, 48, 54, 30),
      door('o-f2-bed2', 'w2-i2', 'Door, bedroom 2', 200, 32, 'wood-door'),
      door('o-f2-bed3', 'w2-i2', 'Door, bedroom 3', 280, 32, 'wood-door'),
      door('o-f2-bath', 'w2-i3', 'Door, bath', 90, 30, 'wood-door'),
    ],
    rooms: [
      room('r-living', 'f1', 'Living room', 'living', [[0, 0], [240, 0], [240, 210], [0, 210]], 'oak-floor'),
      room('r-family', 'f1', 'Family room', 'family', [[0, 210], [240, 210], [240, 360], [0, 360]], 'oak-floor'),
      room('r-dining', 'f1', 'Dining room', 'dining', [[240, 0], [480, 0], [480, 150], [240, 150]], 'oak-floor'),
      room('r-kitchen', 'f1', 'Kitchen', 'kitchen', [[240, 150], [480, 150], [480, 360], [240, 360]], 'tile-floor'),
      room('r-bed2', 'f2', 'Bedroom 2', 'bedroom', [[0, 0], [240, 0], [240, 180], [0, 180]], 'carpet'),
      room('r-bed3', 'f2', 'Bedroom 3', 'bedroom', [[240, 0], [480, 0], [480, 180], [240, 180]], 'carpet'),
      room('r-primary', 'f2', 'Primary bedroom', 'bedroom', [[0, 180], [300, 180], [300, 360], [0, 360]], 'oak-floor'),
      room('r-bath', 'f2', 'Bathroom', 'bath', [[300, 180], [480, 180], [480, 360], [300, 360]], 'tile-floor'),
    ],
    roofs: [{ id: 'roof-main', kind: 'gable', floor: 'f2', name: 'Main roof', axis: 'x', pitch: 6, overhang: 16, thickness: 6, material: 'asphalt-shingle', dims: C }],
    components: [
      box('c-slab', 'slab', 'f1', 'Foundation slab', [240, 180, -4], [486.5, 366.5, 8], 'concrete', { group: 'foundation' }),
      box('c-floor2', 'floor-deck', 'f1', 'Second-floor framing', [240, 180, 114], [473.5, 353.5, 12], 'drywall', { group: 'framing' }),
      box('c-base-cab', 'cabinet', 'f1', 'Base cabinets', [360, 344.75, 17.25], [180, 24, 34.5], 'shaker-white', { room: 'r-kitchen' }),
      box('c-counter', 'countertop', 'f1', 'Countertop', [360, 344, 35.25], [181, 25.5, 1.5], 'quartz-white', { room: 'r-kitchen' }),
      box('c-upper-r', 'cabinet', 'f1', 'Upper cabinets, right', [420, 350.25, 69], [60, 13, 30], 'shaker-white', { room: 'r-kitchen' }),
      box('c-upper-l', 'cabinet', 'f1', 'Upper cabinets, left', [300, 350.25, 69], [60, 13, 30], 'shaker-white', { room: 'r-kitchen' }),
      box('c-island', 'cabinet', 'f1', 'Kitchen island', [360, 251, 17.25], [100, 42, 34.5], 'shaker-white', { room: 'r-kitchen' }),
      box('c-island-top', 'countertop', 'f1', 'Island countertop', [360, 251, 35.25], [104, 46, 1.5], 'quartz-white', { room: 'r-kitchen' }),
      box('c-patio', 'patio', 'f1', 'Back patio slab', [120, 423.25, -2], [192, 120, 4], 'concrete', { group: 'site' }),
    ],
  };
}
