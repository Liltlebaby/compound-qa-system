import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, roundTiming } from '../src/shared/domain.mjs';
import { productionSeries, seriesTotals } from '../src/features/dashboard/dashboard-model.mjs';

const order = DEFAULT_CONFIG.orders[0];
function round(id, date = '2026-11-03', start = '08:00', overrides = {}) {
  const config = { ...structuredClone(DEFAULT_CONFIG), ...overrides };
  return {
    id,
    date,
    start,
    ...roundTiming(config, date, start),
    factory: config.factory,
    shift: config.shift,
    line: config.line,
    snapshot: config,
  };
}
function entry(roundId, pb, orderId = order.id) {
  return { roundId, stationId: 'production', orderId, payload: { values: { pb } } };
}
test('dashboard trend keeps missing, NA, and zero distinct and sums only recorded numbers', () => {
  const a = round('a'),
    b = round('b', undefined, '08:30'),
    c = round('c', undefined, '09:00'),
    d = round('d', undefined, '09:30');
  const series = productionSeries(
    [d, b, a, c],
    [entry('a', '0'), entry('c', '6.30'), entry('d', 'NA')],
    a,
    order,
  );
  assert.deepEqual(
    series.map((p) => p.actual),
    [0, null, 6.3, null],
  );
  assert.equal(series[2].percentage, 78.75);
  assert.deepEqual(seriesTotals(series), { actual: 6.3, recorded: 2, total: 4, maximum: 8 });
  assert.equal(seriesTotals(series.filter((p) => p.actual === null)).actual, null);
});
test('dashboard trend never mixes factory, date, shift, line, or reused order IDs with a new SO', () => {
  const chosen = round('chosen');
  const reused = round('reused', undefined, '08:30');
  reused.snapshot.orders[0].so = '99999';
  const renamed = round('renamed', undefined, '09:00');
  renamed.snapshot.orders[0].id = 'new-id-same-so';
  const all = [
    chosen,
    reused,
    renamed,
    round('other-day', '2026-11-02'),
    round('other-factory', undefined, '08:00', { factory: 'AJ2B' }),
    round('other-line', undefined, '08:00', { line: 'Line 2' }),
    round('other-shift', undefined, '21:00', { shift: 'กะดึก' }),
  ];
  const series = productionSeries(
    all,
    [entry('chosen', '6.3'), entry('reused', '99'), entry('renamed', '8', 'new-id-same-so')],
    chosen,
    order,
  );
  assert.deepEqual(
    series.map((p) => p.id),
    ['chosen', 'renamed'],
  );
  assert.equal(seriesTotals(series).actual, 14.3);
});
test('dashboard orders a night shift by full timestamps across midnight and retains each round target', () => {
  const a = round('before', '2026-11-03', '23:30', { shift: 'กะดึก' }),
    b = round('after', '2026-11-03', '00:00', { shift: 'กะดึก' });
  b.snapshot.orders[0].target = 4;
  const series = productionSeries([b, a], [entry('before', '9'), entry('after', '2')], a, order);
  assert.deepEqual(
    series.map((p) => p.id),
    ['before', 'after'],
  );
  assert.deepEqual(
    series.map((p) => p.percentage),
    [112.5, 50],
  );
  assert.equal(seriesTotals(series).maximum, 9);
});
