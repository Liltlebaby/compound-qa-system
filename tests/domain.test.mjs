import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  STATIONS,
  asNumber,
  percent,
  readiness,
  observations,
  validatePayload,
  validateConfig,
  roundEnd,
  standardReport,
  factsFor,
  fieldsFor,
} from '../src/shared/domain.mjs';
import { createDemo, completeDemoReport } from '../src/features/demo/demo.mjs';
test('production ratio is exact and blank / NA are never zero', () => {
  assert.equal(percent('6.30', 8), 78.75);
  assert.equal(percent(0, 8), 0);
  assert.equal(percent('', 8), null);
  assert.equal(percent(6.3, 0), null);
  for (const v of ['', null, undefined, 'NA', '   ', false]) assert.equal(asNumber(v), null);
});
test('waits for every station on every SO; rejects entries from another round', () => {
  const state = createDemo(),
    r = state.rounds[0];
  assert.equal(readiness(r, state.submissions).complete, false);
  assert.equal(
    readiness(r, [
      ...state.submissions,
      { roundId: r.id, orderId: 'mrf-15701', stationId: 'crates' },
    ]).complete,
    true,
  );
  assert.equal(
    readiness(r, [
      ...state.submissions,
      { roundId: 'other', orderId: 'mrf-15701', stationId: 'crates' },
    ]).complete,
    false,
  );
  const copy = structuredClone(r);
  copy.snapshot.orders.push({ ...copy.snapshot.orders[0], id: 'new-so', so: '999' });
  assert.equal(readiness(copy, state.submissions).missing.length, 6);
});
test('packing warning preserves actual figures and distinct SOs', () => {
  const state = createDemo(),
    packing = state.submissions.find((s) => s.stationId === 'packing');
  assert.match(observations('packing', packing.payload, state.config.orders[0])[0], /5.*4/);
  assert.equal(packing.payload.values.packTotal, '5');
  assert.equal(packing.payload.packSo, '15694');
  assert.equal(packing.payload.warehouseSo, '15701');
});
test('out-of-spec is a warning, PRI without spec is not failed', () => {
  const cfg = DEFAULT_CONFIG,
    order = cfg.orders[0],
    data = { values: { po: '31', pri: '24', mv: '61.2' } };
  assert.deepEqual(validatePayload('quality', data, cfg, order), []);
  assert.equal(observations('quality', data, order).length, 1);
  const state = createDemo();
  assert.match(standardReport(state.rounds[0], state.submissions), /PRI 24 · ไม่มีเกณฑ์สเปก/);
});
test('required blank rejected; zero accepted and NA needs explanation; no negative/fractional crate counts', () => {
  const cfg = DEFAULT_CONFIG,
    order = cfg.orders[0];
  assert.ok(
    validatePayload('quality', { values: { po: '', pri: '24', mv: '61.2' } }, cfg, order).length,
  );
  assert.ok(
    validatePayload('quality', { values: { po: '0', pri: 'NA', mv: '61.2' } }, cfg, order).length,
  );
  assert.equal(
    validatePayload(
      'quality',
      {
        values: { po: '0', pri: 'NA', mv: '61.2' },
        fieldExplanations: { pri: 'ไม่มีตัวอย่างสำหรับตรวจ PRI' },
      },
      cfg,
      order,
    ).length,
    0,
  );
  const data = {
    values: Object.fromEntries(fieldsFor('crates', cfg, order).map((f) => [f.key, '0'])),
    washNo: '',
    repairNo: '',
  };
  data.values.A_in = '1.5';
  assert.ok(validatePayload('crates', data, cfg, order).length);
  data.values.A_in = '-1';
  assert.ok(validatePayload('crates', data, cfg, order).length);
});
test('recipe sums to 100 and real units must be confirmed without guessing', () => {
  const cfg = structuredClone(DEFAULT_CONFIG);
  assert.equal(validateConfig(cfg).length, 0);
  cfg.unitConfirmed = true;
  cfg.biscuitUnit = '';
  assert.ok(validateConfig(cfg).length);
  cfg.burnerFields.forEach((f) => (f.unit = 'unit'));
  cfg.biscuitUnit = 'unit';
  assert.equal(validateConfig(cfg).length, 0);
  cfg.orders[0].recipe[0].percent = 40;
  assert.ok(validateConfig(cfg).length);
});
test('round end rolls across midnight in Bangkok', () => {
  assert.deepEqual(roundEnd('2026-10-29', '23:30'), {
    end: '00:00',
    endAt: '2026-10-29T17:00:00.000Z',
  });
});
test('report source values and old spec snapshots remain immutable', () => {
  const state = createDemo(),
    round = state.rounds[0];
  state.config.orders[0].specs.po = [1, 2];
  assert.deepEqual(round.snapshot.orders[0].specs.po, [32, 42]);
  state.submissions.push({
    id: 'crate',
    roundId: round.id,
    orderId: 'mrf-15701',
    stationId: 'crates',
    payload: { values: {} },
    version: 1,
  });
  const report = standardReport(round, state.submissions);
  assert.match(report, /78.75%/);
  assert.match(report, /PACK MRF\/15694/);
  assert.match(report, /เข้าโกดัง MRF\/15701/);
  assert.match(report, /จำนวน ณ จุดตรวจ/);
  assert.doesNotMatch(report, /รวมเก๊ะทั้งหมด/);
});
test('new rounds have new values, demo reports deduplicate and preserve versions', () => {
  const state = createDemo(),
    r = state.rounds[0];
  const fields = fieldsFor('quality', r.snapshot, r.snapshot.orders[0]);
  assert.equal(fields.length, 3);
  state.submissions.push({
    id: 'demo-crates',
    roundId: r.id,
    orderId: 'mrf-15701',
    stationId: 'crates',
    version: 1,
    payload: { values: {} },
    operatorName: 'QA',
    submittedAt: new Date().toISOString(),
  });
  const once = completeDemoReport(state, r.id),
    again = completeDemoReport(once, r.id);
  assert.equal(once.reports.length, 1);
  assert.equal(again.reports.length, 1);
  again.submissions.find((s) => s.stationId === 'quality').version++;
  const revised = completeDemoReport(again, r.id);
  assert.equal(revised.reports.length, 2);
  assert.equal(revised.reports[1].revision, 2);
  assert.equal(revised.reports[0].text, once.reports[0].text);
});
