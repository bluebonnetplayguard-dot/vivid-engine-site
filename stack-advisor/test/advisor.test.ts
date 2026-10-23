import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED } from '../src/seed.ts';
import { check_edge, check_stack, search_tools, get_tool } from '../src/tools.ts';
import { effective } from '../src/trust.ts';
import { STACK_SOURCES } from '../config/stack-sources.ts';
const NOW = new Date('2026-10-23');

test('verified within 30 days stays verified', () => assert.equal(check_edge(SEED, 'llamaindex', 'qdrant', NOW).tier, 'verified'));
test('verified older than 30 days falls back to checked and says so', () => {
  const r = check_edge(SEED, 'llamaindex', 'ollama', NOW);
  assert.equal(r.tier, 'checked'); assert.ok(r.caveats.some(c => c.includes('until re-run')));
});
test('no evidence is stated, never guessed', () => {
  const r = check_edge(SEED, 'qdrant', 'ollama', NOW);
  assert.equal(r.tier, 'unknown'); assert.equal(r.summary, 'No evidence these connect');
});
test('a newer lab failure is shown and overrides an older pass', () => {
  const r = check_edge(SEED, 'llamaindex', 'chroma', NOW);
  assert.equal(r.summary, 'Latest lab run failed'); assert.ok(r.caveats.some(c => c.includes('import error')));
});
test('indexed stays labeled indexed', () => assert.equal(check_edge(SEED, 'langchain', 'qdrant', NOW).badge, 'Indexed'));
test('order of A and B does not matter', () => assert.equal(check_edge(SEED, 'qdrant', 'llamaindex', NOW).tier, 'verified'));
test('license rules: copyleft in closed product, restricted model', () => {
  const r = check_stack(SEED, ['llamaindex', 'gpl-tool', 'llama-model'], NOW, { closedSource: true });
  assert.ok(r.ok && r.issues.filter(i => i.level === 'problem').length === 2);
});
test('RAG stack with no vector DB warns about the missing piece', () => {
  const r = check_stack(SEED, ['llamaindex', 'ollama'], NOW, { kind: 'rag' });
  assert.ok(r.ok && r.issues.some(i => i.text.includes('vector-db')));
});
test('score cannot be changed by anything but evidence and rules (no vendor input)', () => {
  const a = check_stack(SEED, ['llamaindex', 'qdrant'], NOW); const b = check_stack(structuredClone(SEED), ['llamaindex', 'qdrant'], NOW);
  assert.ok(a.ok && b.ok && a.score === b.score);
});
test('search and get_tool', () => {
  assert.ok(search_tools(SEED, 'vector', { category: 'vector-db' }).length === 3);
  assert.equal(get_tool(SEED, 'qdrant', NOW)!.edges.length, 2);
});
test('evidence age math', () => assert.equal(effective(SEED.edges[0].evidence[0], NOW).ageDays, 13));
test('third-party directories are disabled as a source', () => assert.equal(STACK_SOURCES.find(s => s.id === 'third-party-directories')!.enabled, false));
