import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  validProductionDate,
  productionDate,
  roundsOnDate,
} from '../src/shared/domain.mjs';
test('date selection rejects nonexistent or malformed dates', () => {
  for (const date of ['2026-10-30', '2024-02-29', '2025-01-01'])
    assert.equal(validProductionDate(date), true);
  for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', '30/10/2026', '', null, undefined])
    assert.equal(validProductionDate(date), false);
});
test('current production day uses the night shift start date even when auto-opening is paused', () => {
  const night = {
    ...DEFAULT_CONFIG,
    shift: 'กะดึก',
    schedule: { enabled: false, start: '21:00', end: '08:00' },
  };
  assert.equal(productionDate(night, new Date('2026-10-30T00:15:00+07:00')), '2026-10-29');
  assert.equal(productionDate(night, new Date('2026-10-30T21:15:00+07:00')), '2026-10-30');
  assert.equal(productionDate(DEFAULT_CONFIG, new Date('2026-10-30T10:15:00+07:00')), '2026-10-30');
});
test('round picker shows exactly one production date in time order without changing source history', () => {
  const rounds = [
    { id: 'yesterday', date: '2026-10-29', endAt: '2026-10-29T03:30:00Z' },
    { id: 'early', date: '2026-10-30', endAt: '2026-10-30T02:30:00Z' },
    { id: 'later', date: '2026-10-30', endAt: '2026-10-30T03:30:00Z' },
  ];
  assert.deepEqual(
    roundsOnDate(rounds, '2026-10-30').map((r) => r.id),
    ['later', 'early'],
  );
  assert.deepEqual(roundsOnDate(rounds, '2026-10-28'), []);
  assert.equal(rounds[0].id, 'yesterday');
});
