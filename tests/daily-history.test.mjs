import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './helpers/database.mjs';
import { createService } from '../dist/server/service.mjs';
import { DEFAULT_CONFIG, shiftDate } from '../src/shared/domain.mjs';
test('history API loads the chosen day beyond the previous 200-round window and scopes every record', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'qa-daily-history-'));
  const { database, adapter } = await openDatabase();
  const config = {
    ...structuredClone(DEFAULT_CONFIG),
    requiredStations: ['quality'],
    schedule: { enabled: false, start: '08:00', end: '19:00' },
  };
  const service = createService(adapter, async () => null, {
      clock: () => '2026-10-30T10:15:00+07:00',
    }),
    user = { id: 'admin', role: 'supervisor', name: 'Test' };
  await database
    .prepare('INSERT INTO workspace(id,owner_id,config,version) VALUES(1,?,?,1)')
    .run(user.id, JSON.stringify(config));
  try {
    const oldId = await service.createRound(user, {
      factory: 'AJ2',
      shift: 'กะเช้า',
      date: '2025-01-01',
      start: '10:00',
    });
    const todayId = await service.createRound(user, {
      factory: 'AJ2',
      shift: 'กะเช้า',
      date: '2026-10-30',
      start: '10:00',
    });
    for (let i = 0; i < 205; i++)
      await service.createRound(user, {
        factory: 'AJ2',
        shift: 'กะเช้า',
        date: shiftDate('2026-01-01', i),
        start: '10:00',
      });
    for (const roundId of [oldId, todayId])
      await service.saveSubmission(user, {
        roundId,
        stationId: 'quality',
        orderId: config.orders[0].id,
        requestId: 'history-request-' + roundId,
        expectedVersion: 0,
        payload: { values: { po: '36', pri: '24', mv: '61.2' } },
      });
    await service.generateReports();
    const current = await service.getState(user, { factory: 'AJ2', shift: 'กะเช้า' });
    assert.equal(current.selectedDate, '2026-10-30');
    assert.deepEqual(
      current.rounds.map((r) => r.id),
      [todayId],
    );
    assert.equal(current.submissions.length, 1);
    assert.equal(current.reports.length, 0);
    const history = await service.getState(user, {
      factory: 'AJ2',
      shift: 'กะเช้า',
      date: '2025-01-01',
    });
    assert.equal(history.selectedDate, '2025-01-01');
    assert.deepEqual(
      history.rounds.map((r) => r.id),
      [oldId],
    );
    for (const key of ['submissions', 'audits', 'reports']) {
      assert.equal(history[key].length, 1);
      assert.equal(history[key][0].roundId, oldId);
    }
    const empty = await service.getState(user, {
      factory: 'AJ2',
      shift: 'กะเช้า',
      date: '2024-12-31',
    });
    for (const key of ['rounds', 'submissions', 'reports', 'audits'])
      assert.equal(empty[key].length, 0);
    const anotherFactory = await service.getState(user, {
      factory: 'AJ2B',
      shift: 'กะเช้า',
      date: '2025-01-01',
    });
    assert.equal(anotherFactory.rounds.length, 0);
    const night = await service.getState(user, {
      factory: 'AJ2',
      shift: 'กะดึก',
      date: '2025-01-01',
    });
    assert.equal(night.rounds.length, 0);
    await assert.rejects(
      service.getState(user, { factory: 'AJ2', shift: 'กะเช้า', date: '2026-02-30' }),
      (e) => e.status === 422,
    );
    await assert.rejects(
      service.getState(
        { id: 'qa', role: 'qa', factories: ['AJ2'], stations: ['quality'] },
        { factory: 'AJ2B', shift: 'กะเช้า', date: '2025-01-01' },
      ),
      (e) => e.status === 403,
    );
  } finally {
    await database.close();
    assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep));
    assert.ok(resolve(folder).split(sep).at(-1).startsWith('qa-daily-history-'));
    await rm(folder, { recursive: true, force: true });
  }
});
