import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATIONS,
  DEFAULT_CONFIG,
  fieldsFor,
  towerProgress,
  validatePayload,
} from '../src/shared/domain.mjs';
test('tower station keeps its existing identity and tracks required counts without treating blanks as zero', () => {
  assert.equal(STATIONS.find((s) => s.id === 'crates').name, 'หอโรย');
  const config = DEFAULT_CONFIG,
    order = config.orders[0],
    payload = {
      values: Object.fromEntries(fieldsFor('crates', config, order).map((f) => [f.key, ''])),
      washNo: '',
      repairNo: '',
    };
  assert.equal(towerProgress(payload, config, order).filter((p) => p.complete).length, 0);
  for (const key of Object.keys(payload.values)) payload.values[key] = '0';
  assert.equal(towerProgress(payload, config, order).filter((p) => p.complete).length, 6);
  payload.values.A_in = '1.5';
  assert.equal(towerProgress(payload, config, order)[1].complete, false);
  assert.ok(validatePayload('crates', payload, config, order).length);
  payload.values.A_in = 'NA';
  assert.equal(towerProgress(payload, config, order)[1].complete, false);
  payload.fieldExplanations = { A_in: 'จุด A หยุดใช้งานในรอบนี้' };
  assert.equal(towerProgress(payload, config, order)[1].complete, true);
  payload.values.wash = '2';
  assert.equal(towerProgress(payload, config, order)[5].complete, true);
  assert.equal(validatePayload('crates', payload, config, order).length, 0);
  payload.values.repair = '1';
  assert.equal(towerProgress(payload, config, order)[5].complete, false);
  assert.ok(validatePayload('crates', payload, config, order).length);
  payload.repairNo = '3';
  assert.equal(towerProgress(payload, config, order)[5].complete, true);
  assert.equal(validatePayload('crates', payload, config, order).length, 0);
});
