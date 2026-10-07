import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAction } from './tools.js';

test('parseAction accepts valid tool calls and drops extra keys', () => {
  assert.deepEqual(parseAction('click', { id: 3, reason: 'open signup', extra: 'ignored' }), {
    type: 'click',
    id: 3,
    reason: 'open signup',
  });
  assert.deepEqual(parseAction('scroll', { direction: 'down', reason: 'see more' }), {
    type: 'scroll',
    direction: 'down',
    reason: 'see more',
  });
});

test('parseAction rejects malformed model output', () => {
  assert.throws(() => parseAction('delete_db', {}), /Unknown action/);
  assert.throws(() => parseAction('click', null), /must be an object/);
  assert.throws(() => parseAction('click', { id: '3', reason: 'x' }), /invalid or missing "id"/);
  assert.throws(() => parseAction('click', { id: 1.5, reason: 'x' }), /invalid or missing "id"/);
  assert.throws(() => parseAction('type', { id: 1, text: 'hi', reason: 'x' }), /invalid or missing "submit"/);
  assert.throws(() => parseAction('report_bug', { title: 't', severity: 'urgent', details: 'd' }), /"severity"/);
});
