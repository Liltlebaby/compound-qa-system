import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './helpers/database.mjs';
import { createService } from '../dist/server/service.mjs';
import {
  DEFAULT_CONFIG,
  fieldsFor,
  prepareOvenPayload,
  ovenSettingDefaults,
  withOvenEpochs,
} from '../src/shared/domain.mjs';
test('new oven forms require only twelve measured fields; SV/time are inherited and units are explicit', () => {
  const cfg = DEFAULT_CONFIG,
    order = cfg.orders[0],
    fields = fieldsFor('oven', cfg, order);
  assert.equal(fields.filter((f) => f.required).length, 12);
  assert.equal(fields.filter((f) => f.capture === 'on-change').length, 8);
  assert.equal(cfg.biscuitUnit, 'กก.');
  assert.equal(cfg.burnerFields[0].unit, '°C');
  assert.equal(cfg.burnerFields[1].unit, '°C');
  const values = Object.fromEntries(
      fields.filter((f) => f.capture === 'measured' || !f.capture).map((f) => [f.key, '']),
    ),
    payload = prepareOvenPayload({ values }, ovenSettingDefaults(order));
  assert.equal(payload.values.A_burner0, '138');
  assert.equal(payload.values.A_burner2, '6.15');
  assert.equal(payload.values.A_burner1, '');
  assert.equal(payload.values.A_biscuit, '');
  assert.equal(payload.values.A_temp, '');
  const changed = structuredClone(cfg);
  changed.orders[0].so = 'NEW-SO';
  assert.notEqual(
    withOvenEpochs(cfg, changed, () => 'new-plan').orders[0].ovenSettingsEpoch,
    'initial',
  );
});
test('settings persist by factory/shift/SO, stale drafts conflict, and historical edits cannot replace newer settings', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'qa-oven-settings-')),
    db = await openDatabase(),
    { database, adapter } = db;
  const config = { ...structuredClone(DEFAULT_CONFIG), requiredStations: ['oven'] },
    admin = { id: 'admin', role: 'supervisor', name: 'Admin' },
    qa = { id: 'qa', role: 'qa', name: 'QA oven', stations: ['oven'], factories: ['AJ2'] };
  await database
    .prepare('INSERT INTO workspace(id,owner_id,config,version) VALUES(1,?,?,1)')
    .run(admin.id, JSON.stringify(config));
  const service = createService(adapter, async () => null, {
      clock: () => '2026-10-30T10:15:00+07:00',
    }),
    orderId = config.orders[0].id;
  const create = async (start) =>
    service.createRound(admin, { factory: 'AJ2', shift: 'กะเช้า', date: '2026-10-30', start });
  const state = () =>
    service.getState(admin, { factory: 'AJ2', shift: 'กะเช้า', date: '2026-10-30' });
  async function payload(roundId, changes = {}) {
    const s = await state(),
      r = s.rounds.find((r) => r.id === roundId),
      o = r.snapshot.orders[0],
      values = {};
    for (const b of ['A', 'B', 'C', 'D'])
      Object.assign(values, {
        [b + '_burner1']: '138.1',
        [b + '_biscuit']: '17.22',
        [b + '_temp']: '50.6',
      });
    return prepareOvenPayload(
      { values, ovenChanges: changes, notes: '' },
      s.ovenSettings[r.id + ':' + o.id],
    );
  }
  const body = (roundId, data, version = 0, reason = '') => ({
    roundId,
    stationId: 'oven',
    orderId,
    payload: data,
    expectedVersion: version,
    reason,
    requestId: crypto.randomUUID(),
  });
  try {
    const early = await create('09:00'),
      changed = await create('09:30'),
      current = await create('10:00');
    const stale = await payload(current);
    await service.saveSubmission(qa, body(early, await payload(early)));
    assert.equal((await database.prepare('SELECT COUNT(*) n FROM oven_setting_events').get()).n, 0);
    const modified = await payload(changed, { A: { sv: '140', time: '6.30' } });
    const submitted = body(changed, modified);
    await service.saveSubmission(qa, submitted);
    await service.saveSubmission(qa, submitted);
    assert.equal((await database.prepare('SELECT COUNT(*) n FROM oven_setting_events').get()).n, 1);
    let s = await state();
    assert.deepEqual(s.ovenSettings[current + ':' + orderId].A, { sv: '140', time: '6.30' });
    assert.deepEqual(s.ovenSettings[current + ':' + orderId].B, { sv: '138', time: '6.15' });
    await assert.rejects(service.saveSubmission(qa, body(current, stale)), (e) => e.status === 409);
    const beforeRace = (
      await database
        .prepare('SELECT changes FROM oven_setting_events WHERE round_id=?')
        .get(changed)
    ).changes;
    const raceAdapter = {
      prepare: (sql) => adapter.prepare(sql),
      batch: async (statements) => {
        await database
          .prepare('UPDATE oven_setting_events SET changes=? WHERE round_id=?')
          .run(JSON.stringify({ A: { sv: '141', time: '6.30' } }), changed);
        return adapter.batch(statements);
      },
    };
    const racing = createService(raceAdapter, async () => null, {
        clock: () => '2026-10-30T10:15:00+07:00',
      }),
      raceBody = body(current, await payload(current));
    await assert.rejects(racing.saveSubmission(qa, raceBody), (e) => e.status === 409);
    assert.equal(
      (await database.prepare('SELECT COUNT(*) n FROM submissions WHERE round_id=?').get(current))
        .n,
      0,
    );
    assert.equal(
      (await database.prepare('SELECT COUNT(*) n FROM requests WHERE id=?').get(raceBody.requestId))
        .n,
      0,
    );
    await database
      .prepare('UPDATE oven_setting_events SET changes=? WHERE round_id=?')
      .run(beforeRace, changed);
    await service.saveSubmission(qa, body(current, await payload(current)));
    assert.equal((await database.prepare('SELECT COUNT(*) n FROM oven_setting_events').get()).n, 1);
    const bad = await payload(current);
    bad.ovenChanges = { A: { sv: '141' } };
    bad.values.A_burner0 = '150';
    await assert.rejects(
      service.saveSubmission(qa, body(current, bad, 1, 'ทดสอบ')),
      (e) => e.status === 422,
    );
    await service.saveSubmission(
      qa,
      body(early, await payload(early, { A: { sv: '139' } }), 1, 'แก้ค่าตั้งของรอบเก่า'),
    );
    s = await state();
    assert.equal(s.ovenSettings[current + ':' + orderId].A.sv, '140');
    assert.equal(s.submissions.find((x) => x.roundId === current).payload.values.A_burner0, '140');
    const old = await database.prepare('SELECT snapshot FROM rounds WHERE id=?').get(changed);
    assert.equal(JSON.parse(old.snapshot).orders[0].burnerSet.A[0], 138);
    await service.generateReports();
    assert.match(
      (await database.prepare('SELECT text FROM reports WHERE round_id=?').get(changed)).text,
      /ปรับค่าตั้งเตา A/,
    );
    assert.match(
      (await database.prepare('SELECT text FROM reports WHERE round_id=?').get(changed)).text,
      /6 นาที 30 วินาที/,
    );
    const reset = structuredClone(s.config);
    reset.orders[0].burnerSet.A[0] = 145;
    await service.updateConfig(admin, reset, s.configVersion);
    const future = await create('10:30');
    s = await state();
    assert.equal(s.ovenSettings[future + ':' + orderId].A.sv, '145');
    assert.equal(s.ovenSettings[future + ':' + orderId].A.time, '6.15');
    await assert.rejects(
      service.saveSubmission(
        { id: 'other', role: 'qa', stations: ['quality'], factories: ['AJ2'] },
        body(future, await payload(future)),
      ),
      (e) => e.status === 403,
    );
  } finally {
    await database.close();
    assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep));
    assert.ok(resolve(folder).split(sep).at(-1).startsWith('qa-oven-settings-'));
    await rm(folder, { recursive: true, force: true });
  }
});
