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
} from '../src/shared/domain.mjs';
test('server clock opens rounds without a browser, keeps snapshots, and waits for full submissions', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'qa-auto-rounds-'));
  const { database, adapter } = await openDatabase();
  let at = '2026-10-30T07:59:59+07:00';
  const service = createService(adapter, async () => null, { clock: () => at });
  const cfg = structuredClone(DEFAULT_CONFIG);
  cfg.unitConfirmed = true;
  cfg.burnerFields.forEach((f) => (f.unit = 'test'));
  cfg.biscuitUnit = 'test';
  cfg.profiles = {
    'AJ2|กะดึก': { ...structuredClone(cfg), shift: 'กะดึก' },
    'AJ2B|กะเช้า': { ...structuredClone(cfg), factory: 'AJ2B' },
  };
  const user = { id: 'test-admin', role: 'supervisor', name: 'Test supervisor' };
  await database
    .prepare('INSERT INTO workspace(id,owner_id,config,version) VALUES(1,?,?,1)')
    .run(user.id, JSON.stringify(cfg));
  const all = async () => await database.prepare('SELECT * FROM rounds ORDER BY end_at').all();
  try {
    // Night shift belongs to the previous production date until 08:00.
    await service.generateReports();
    assert.equal((await all()).length, 1);
    assert.equal((await all())[0].date, '2026-10-29');
    at = '2026-10-30T08:00:00+07:00';
    await service.generateReports();
    assert.equal((await all()).length, 3);
    const morning = (await all()).find((r) => r.factory === 'AJ2' && r.shift === 'กะเช้า');
    await Promise.all([
      service.ensureAutomaticRounds(),
      service.ensureAutomaticRounds(),
      service.generateReports(),
    ]);
    assert.equal((await all()).length, 3, 'concurrent and repeated ticks do not duplicate rounds');
    assert.equal((await database.prepare('SELECT COUNT(*) n FROM submissions').get()).n, 0);
    const changed = structuredClone(cfg);
    changed.orders[0].so = 'NEW-SO';
    await database.prepare('UPDATE workspace SET config=?').run(JSON.stringify(changed));
    at = '2026-10-30T08:30:00+07:00';
    await service.generateReports();
    assert.equal((await all()).length, 5, 'incomplete previous rounds do not block new rounds');
    assert.equal(
      JSON.parse((await all()).find((r) => r.id === morning.id).snapshot).orders[0].so,
      '15701',
    );
    assert.equal(
      JSON.parse((await all()).find((r) => r.factory === 'AJ2' && r.start === '08:30').snapshot)
        .orders[0].so,
      'NEW-SO',
    );
    assert.equal(
      (await database.prepare('SELECT COUNT(*) n FROM reports').get()).n,
      0,
      'no partial reports',
    );
    const snapshot = JSON.parse(morning.snapshot),
      order = snapshot.orders[0];
    for (const [i, stationId] of snapshot.requiredStations.entries()) {
      const values = Object.fromEntries(
        fieldsFor(stationId, snapshot, order).map((f) => [f.key, '0']),
      );
      let payload = {
        values,
        confirmation: 'test',
        packCustomer: 'MRF',
        packSo: '15701',
        warehouseCustomer: 'MRF',
        warehouseSo: '15701',
        defectCustomer: 'MRF',
        defectSo: '15701',
      };
      if (stationId === 'oven') payload = prepareOvenPayload(payload, ovenSettingDefaults(order));
      if (stationId === 'production') values.pb = '6.30';
      if (stationId === 'quality') Object.assign(values, { po: '36', pri: '24', mv: '61.2' });
      await service.saveSubmission(user, {
        requestId: 'automatic-test-request-' + i,
        roundId: morning.id,
        stationId,
        orderId: order.id,
        payload,
        expectedVersion: 0,
      });
      await service.generateReports();
      assert.equal(
        (await database.prepare('SELECT COUNT(*) n FROM reports').get()).n,
        i === snapshot.requiredStations.length - 1 ? 1 : 0,
      );
    }
    await service.generateReports();
    assert.equal((await database.prepare('SELECT COUNT(*) n FROM reports').get()).n, 1);
    assert.match((await database.prepare('SELECT text FROM reports').get()).text, /78.75%/);
    at = '2026-10-30T19:00:00+07:00';
    await service.generateReports();
    assert.equal((await all()).length, 5, 'gap opens no rounds');
    at = '2026-10-30T21:00:00+07:00';
    await service.generateReports();
    assert.equal((await all()).length, 6);
    at = '2026-10-31T00:00:00+07:00';
    await service.generateReports();
    const midnight = (await all()).find((r) => r.shift === 'กะดึก' && r.start === '00:00');
    assert.equal(midnight.date, '2026-10-30');
    assert.equal(midnight.end_at, '2026-10-30T17:30:00.000Z');
    const count = (await all()).length;
    // Restart the service, without a web request; recover only the current slot.
    at = '2026-10-31T04:12:00+07:00';
    const restarted = createService(adapter, async () => null, { clock: () => at });
    await restarted.generateReports();
    assert.equal((await all()).length, count + 1);
    assert.equal((await all()).at(-1).start, '04:00');
    changed.profiles['AJ2|กะดึก'].schedule = { enabled: false, start: '21:00', end: '08:00' };
    await database.prepare('UPDATE workspace SET config=?').run(JSON.stringify(changed));
    at = '2026-10-31T04:30:00+07:00';
    await restarted.generateReports();
    assert.equal((await all()).length, count + 1, 'pause prevents further rounds');
  } finally {
    await database.close();
    assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep));
    assert.ok(resolve(folder).split(sep).at(-1).startsWith('qa-auto-rounds-'));
    await rm(folder, { recursive: true, force: true });
  }
});
