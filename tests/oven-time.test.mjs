import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  durationSeconds,
  durationText,
  fieldsFor,
  validatePayload,
  validateConfig,
  standardReport,
  knownOvenTime,
  upgradeDemoOvenTime,
} from '../src/shared/domain.mjs';
import { createDemo } from '../src/features/demo/demo.mjs';
test('oven time is minutes and seconds, including leading/trailing zero seconds', () => {
  for (const [value, seconds] of [
    ['6.15', 375],
    ['6.05', 365],
    ['6.10', 370],
    ['6.00', 360],
    ['0.00', 0],
    ['6:15', 375],
    [6.15, 375],
  ])
    assert.equal(durationSeconds(value), seconds);
  for (const value of ['6.60', '6.99', '6.5', '-1.15', '', '   ', 'NA', null, false, '6.150'])
    assert.equal(durationSeconds(value), null);
  assert.equal(durationText('6.15'), '6 นาที 15 วินาที');
  assert.equal(durationText('6.10'), '6 นาที 10 วินาที');
  assert.equal(durationText(''), 'ยังไม่กรอก');
  assert.equal(durationText('NA'), 'ไม่เกี่ยวข้อง');
});
test('oven form and plan validation reject impossible seconds and reports use human-readable duration', () => {
  const cfg = structuredClone(DEFAULT_CONFIG),
    order = cfg.orders[0],
    values = Object.fromEntries(fieldsFor('oven', cfg, order).map((f) => [f.key, '0']));
  values.A_burner2 = '6.15';
  assert.equal(validatePayload('oven', { values }, cfg, order).length, 0);
  values.A_burner2 = '6.60';
  assert.match(validatePayload('oven', { values }, cfg, order).join(' '), /วินาที 00–59/);
  order.burnerSet.A[2] = '6.10';
  assert.equal(validateConfig(cfg).length, 0);
  order.burnerSet.A[2] = '6.60';
  assert.ok(validateConfig(cfg).length);
  const demo = createDemo(),
    text = standardReport(demo.rounds[0], demo.submissions);
  assert.match(text, /เวลาอบยาง/);
  assert.match(text, /6 นาที 15 วินาที/);
});
test('placeholder plan labels can be clarified without mutating stored historical snapshots', () => {
  const cfg = structuredClone(DEFAULT_CONFIG);
  cfg.burnerFields[2] = { label: 'ค่า Burner 3', unit: '' };
  const before = structuredClone(cfg),
    updated = knownOvenTime(cfg);
  assert.equal(updated.burnerFields[2].label, 'เวลาอบยาง');
  assert.deepEqual(cfg, before);
  assert.equal(updated.unitConfirmed, true);
  const live = { demo: false, config: cfg, rounds: [{ snapshot: cfg }] };
  assert.equal(upgradeDemoOvenTime(live), live);
  assert.equal(live.rounds[0].snapshot.burnerFields[2].label, 'ค่า Burner 3');
});
