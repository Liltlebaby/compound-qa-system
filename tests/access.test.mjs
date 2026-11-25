import test from 'node:test';
import assert from 'node:assert/strict';
import { requireSupervisor, requireFactory, requireStation } from '../src/shared/access.mjs';
test('QA cannot change plans or edit unassigned station', () => {
  const qa = { role: 'qa', factories: ['AJ2'], stations: ['quality'] };
  assert.doesNotThrow(() => requireStation(qa, 'quality'));
  assert.throws(() => requireStation(qa, 'oven'), { status: 403 });
  assert.throws(() => requireSupervisor(qa), { status: 403 });
});
test('QA cannot read or write another factory', () => {
  const qa = { role: 'qa', factories: ['AJ2'], stations: ['quality'] };
  assert.doesNotThrow(() => requireFactory(qa, 'AJ2'));
  assert.throws(() => requireFactory(qa, 'AJ2B'), { status: 403 });
});
test('missing grants deny access; supervisors manage both factories', () => {
  assert.throws(() => requireFactory({ role: 'qa' }, 'AJ2'), { status: 403 });
  assert.throws(() => requireStation(null, 'quality'), { status: 403 });
  for (const factory of ['AJ2', 'AJ2B'])
    assert.doesNotThrow(() => requireFactory({ role: 'supervisor' }, factory));
  assert.doesNotThrow(() => requireSupervisor({ role: 'supervisor' }));
});
