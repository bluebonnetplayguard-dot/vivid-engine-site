// Fails the build if anything in the index comes from a non-allowlisted source or domain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { checkIndex } from '../src/index-guard.ts';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

test('the real index contains only allowlisted sources', async () => {
  const { problems } = await checkIndex(here('../data/index'));
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('guard passes a clean sample', async () => {
  const { checked, problems } = await checkIndex(here('./fixtures/good-index'));
  assert.equal(checked, 1);
  assert.deepEqual(problems, []);
});

test('guard catches Westlaw, unknown domains and link-only sources', async () => {
  const { checked, problems } = await checkIndex(here('./fixtures/bad-index'));
  assert.equal(checked, 4);
  assert.equal(problems.length, 3, problems.join('\n'));
  assert.ok(problems.some(p => /westlaw/i.test(p)));
  assert.ok(problems.some(p => /does not belong/.test(p)));
  assert.ok(problems.some(p => /link-only/.test(p)));
});
