// Fence takeoff on the sample plan (sample/backyard-fence-plan.pdf, sheet C-101, 1/8"=1'-0").
import * as M from './measure.ts';
const printed = M.parseScale('1/8"=1\'-0"');
const cal = M.calibrate([200, 70], [920, 70], 80, printed);          // the 80'-0" dimension string
console.log(`Printed scale 1/8"=1'-0": ${(printed * 72).toFixed(2)} ft per inch. Two-point check: ${cal.message}`);
const fence: M.Pt[] = [[200, 1180], [200, 100], [920, 100], [920, 1180]];
const r = M.fencePosts(fence, cal.ftPerPt, 8, 1);
console.log(`Fence run ${r.totalFt.toFixed(1)} LF (${r.segmentsFt.map(f => M.ftIn(f)).join(' + ')}), less one 4' gate = ${(r.totalFt - 4).toFixed(1)} LF`);
console.log(`Posts: ${r.terminals} end/corner + ${r.linePosts} line + ${r.gatePosts} gate = ${r.posts} (max 8 ft bays, ${r.bays} bays)`);
