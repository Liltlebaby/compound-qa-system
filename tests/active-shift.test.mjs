import test from 'node:test';
import assert from 'node:assert/strict';
import { activeShift } from '../src/shared/domain.mjs';
const at = (s) => new Date(s + '+07:00');
test('active shift switches at Bangkok boundaries, preserves overnight date and leaves gaps empty', () => {
  assert.equal(activeShift('AJ2', at('2026-10-30T20:59:59')), null);
  assert.deepEqual(activeShift('AJ2', at('2026-10-30T21:00:00')), {
    shift: 'กะดึก',
    date: '2026-10-30',
  });
  assert.deepEqual(activeShift('AJ2', at('2026-11-01T00:00:00')), {
    shift: 'กะดึก',
    date: '2026-10-31',
  });
  assert.deepEqual(activeShift('AJ2', at('2026-10-31T07:59:59')), {
    shift: 'กะดึก',
    date: '2026-10-30',
  });
  assert.deepEqual(activeShift('AJ2', at('2026-10-31T08:00:00')), {
    shift: 'กะเช้า',
    date: '2026-10-31',
  });
  assert.equal(activeShift('AJ2', at('2026-10-31T19:00:00')), null);
  assert.equal(activeShift('AJ2B', at('2026-10-31T21:00:00')), null);
});
test('active shift follows configured times even when automatic round creation is paused', () => {
  const schedules = [
    { name: 'กะเช้า', start: '08:00', end: '19:00', enabled: true },
    { name: 'กะดึก', start: '22:00', end: '08:00', enabled: false },
  ];
  assert.equal(activeShift('AJ2', at('2026-10-30T21:00:00'), schedules), null);
  assert.deepEqual(activeShift('AJ2', at('2026-10-30T22:00:00'), schedules), {
    shift: 'กะดึก',
    date: '2026-10-30',
  });
});
