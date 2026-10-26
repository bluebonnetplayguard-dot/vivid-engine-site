import { AICommand } from './command-schema';

// "Never hallucinate dimensions." Every size in a geometry command must come from the contractor's words.
// This finds the lengths the contractor actually said (in inches) and marks any geometry size the AI produced
// that doesn't match one of them as inferred, so the preview asks the contractor to check it, whether or not
// the AI admitted to choosing it.

const WORDS: Record<string, number> = { zero: 0, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, eighteen: 18, twenty: 20, thirty: 30, forty: 40, half: 0.5 };
const NUM = `(\\d+(?:\\.\\d+)?|${Object.keys(WORDS).join('|')})`;
const val = (s: string) => (s in WORDS ? WORDS[s] : parseFloat(s));

// All lengths stated in a message, in inches: "2 feet", "two feet", "3' 6\"", "18 in", "14 ft wide", "16x12".
export function statedLengths(message: string): number[] {
  let t = message.toLowerCase().replace(/[’′]/g, "'").replace(/[”″]/g, '"');
  const out: number[] = [];
  // Each pattern consumes what it matched, so "3' 6\"" is 42 and not also 6.
  const take = (re: RegExp, f: (m: RegExpMatchArray) => number[]) => { t = t.replace(re, (...args) => { out.push(...f(args as unknown as RegExpMatchArray)); return ' '; }); };
  take(new RegExp(`${NUM}\\s*(?:feet|foot|ft|')\\s*(?:and\\s*)?${NUM}\\s*(?:inches|inch|in\\b|")`, 'g'), m => [val(m[1]) * 12 + val(m[2])]);
  take(/(\d+(?:\.\d+)?)\s*(?:x|by)\s*(\d+(?:\.\d+)?)/g, m => [parseFloat(m[1]) * 12, parseFloat(m[2]) * 12]);   // "16x12": feet implied
  take(new RegExp(`${NUM}\\s*(?:feet|foot|ft|')`, 'g'), m => [val(m[1]) * 12]);
  take(new RegExp(`${NUM}\\s*(?:inches|inch|in\\b|")`, 'g'), m => [val(m[1])]);
  return [...new Set(out.filter(Number.isFinite))];
}

const GEOMETRY_FIELDS: Record<string, string[]> = { MOVE_OBJECT: ['along', 'up'], RESIZE_OBJECT: ['width', 'height', 'depth', 'sill'], ADD_COMPONENT: ['width', 'depth'] };

export function guardDimensions(cmd: AICommand, message: string): { command: AICommand; added: string[] } {
  const fields = GEOMETRY_FIELDS[cmd.type];
  if (!fields) return { command: cmd, added: [] };
  const said = statedLengths(message);
  const added: string[] = [];
  for (const f of fields) {
    const v = cmd.payload[f];
    if (typeof v !== 'number') continue;
    const matches = said.some(s => Math.abs(Math.abs(v) - s) <= 0.5);
    if (!matches && !cmd.meta.inferred.includes(f)) added.push(f);
  }
  if (!added.length) return { command: cmd, added };
  return { command: { ...cmd, meta: { ...cmd.meta, inferred: [...cmd.meta.inferred, ...added] } }, added };
}
