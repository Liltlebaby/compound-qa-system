import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  currentSlot,
  roundTiming,
  validateConfig,
  scheduleFor,
  ensureDemoRound,
} from '../src/shared/domain.mjs';

const config = (factory = 'AJ2', shift = 'กะเช้า') => ({
  ...structuredClone(DEFAULT_CONFIG),
  factory,
  shift,
});
const slot = (c, time) => currentSlot(c, new Date(time + '+07:00'));
test('AJ2 and AJ2B open only inside their declared day shifts', () => {
  for (const factory of ['AJ2', 'AJ2B']) {
    const c = config(factory);
    assert.equal(slot(c, '2026-10-30T07:59:59'), null);
    assert.deepEqual(slot(c, '2026-10-30T08:00:00'), { date: '2026-10-30', start: '08:00' });
    assert.deepEqual(slot(c, '2026-10-30T08:29:59'), { date: '2026-10-30', start: '08:00' });
    assert.deepEqual(slot(c, '2026-10-30T08:30:00'), { date: '2026-10-30', start: '08:30' });
    assert.deepEqual(slot(c, '2026-10-30T18:59:59'), { date: '2026-10-30', start: '18:30' });
    assert.equal(slot(c, '2026-10-30T19:00:00'), null);
  }
});
test('night shift retains production date across midnight, month and year boundaries', () => {
  const c = config('AJ2', 'กะดึก');
  assert.equal(slot(c, '2026-10-30T20:59:59'), null);
  assert.deepEqual(slot(c, '2026-10-30T21:00:00'), { date: '2026-10-30', start: '21:00' });
  assert.deepEqual(slot(c, '2026-10-31T00:00:00'), { date: '2026-10-30', start: '00:00' });
  assert.deepEqual(slot(c, '2026-11-01T07:59:59'), { date: '2026-10-31', start: '07:30' });
  assert.deepEqual(slot(c, '2027-01-01T00:30:00'), { date: '2026-12-31', start: '00:30' });
  assert.equal(slot(c, '2026-10-31T08:00:00'), null);
  assert.deepEqual(roundTiming(c, '2026-10-30', '23:30'), {
    end: '00:00',
    endAt: '2026-10-30T17:00:00.000Z',
  });
  assert.deepEqual(roundTiming(c, '2026-10-30', '07:30'), {
    end: '08:00',
    endAt: '2026-10-31T01:00:00.000Z',
  });
});
test('paused schedules and invalid half-hour shift boundaries are handled explicitly', () => {
  const c = config();
  c.schedule = { ...scheduleFor(c), enabled: false };
  assert.equal(slot(c, '2026-10-30T10:00:00'), null);
  for (const schedule of [
    { start: '08:15', end: '19:00', enabled: true },
    { start: '08:00', end: '08:00', enabled: true },
    { start: '99:00', end: '19:00', enabled: true },
    { start: '08:00', end: '19:00', enabled: 'yes' },
  ]) {
    assert.ok(validateConfig({ ...config(), schedule }).length);
  }
});
test('demo advances once per slot without copying measurements or mutating old snapshots', () => {
  const state = { config: config(), rounds: [], submissions: [] },
    at = new Date('2026-10-30T08:00:00+07:00');
  const first = ensureDemoRound(state, at);
  assert.equal(first.rounds.length, 1);
  assert.equal(ensureDemoRound(first, at), first);
  const next = ensureDemoRound(first, new Date('2026-10-30T08:30:00+07:00'));
  assert.equal(next.rounds.length, 2);
  assert.equal(next.submissions.length, 0);
  next.config.orders[0].so = 'new';
  assert.equal(next.rounds[1].snapshot.orders[0].so, '15701');
});
