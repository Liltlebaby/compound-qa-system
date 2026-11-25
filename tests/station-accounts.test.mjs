import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './helpers/database.mjs';
import { stationAccount } from '../src/server/station-accounts.mjs';
import { createService } from '../dist/server/service.mjs';
import { DEFAULT_CONFIG, STATIONS } from '../src/shared/domain.mjs';
test('QR accounts are reused by station scope, cannot cross scopes or become supervisors, and record their own actor', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'qa-station-accounts-')),
    { database, adapter } = await openDatabase();
  try {
    const scope = { factory: 'AJ2', shift: 'กะเช้า', line: 'Line 8', stationId: 'quality' };
    await assert.rejects(async () => await stationAccount(database, scope), { status: 409 });
    await database
      .prepare('INSERT INTO workspace VALUES(1,?,?,1)')
      .run('owner', JSON.stringify(DEFAULT_CONFIG));
    const accounts = await Promise.all(
      STATIONS.map(async (s) => await stationAccount(database, { ...scope, stationId: s.id })),
    );
    assert.equal(new Set(accounts.map((a) => a.id)).size, 5);
    assert.equal((await stationAccount(database, scope)).id, accounts[1].id);
    const quality = accounts[1],
      night = await stationAccount(database, { ...scope, shift: 'กะดึก' });
    assert.notEqual(night.id, quality.id);
    await assert.rejects(
      async () => await stationAccount(database, { ...scope, line: 'Line 99' }),
      { status: 403 },
    );
    await assert.rejects(
      async () => await stationAccount(database, { ...scope, factory: 'AJ2B', shift: 'กะดึก' }),
      {
        status: 422,
      },
    );
    const email = (await database.prepare('SELECT email FROM members WHERE id=?').get(quality.id))
      .email;
    // Even a mistaken role edit can't turn a QR session into an admin session.
    await database.prepare("UPDATE members SET role='supervisor' WHERE id=?").run(quality.id);
    const svc = createService(
      adapter,
      async () => ({ userId: quality.id, email, stationScope: quality.scope }),
      { clock: () => new Date('2026-10-30T10:15:00+07:00') },
    );
    const user = await svc.member();
    assert.equal(user.role, 'qa');
    assert.equal(user.accountType, 'station');
    assert.deepEqual(user.stations, ['quality']);
    const admin = { id: 'owner', role: 'supervisor', name: 'Admin' };
    const dayId = await svc.createRound(admin, {
      factory: 'AJ2',
      shift: 'กะเช้า',
      date: '2026-10-30',
      start: '10:00',
    });
    const nightId = await svc.createRound(admin, {
      factory: 'AJ2',
      shift: 'กะดึก',
      date: '2026-10-30',
      start: '21:00',
    });
    await database
      .prepare('UPDATE workspace SET config=?')
      .run(JSON.stringify({ ...DEFAULT_CONFIG, line: 'Line 9' }));
    const otherLine = await svc.createRound(admin, {
      factory: 'AJ2',
      shift: 'กะเช้า',
      date: '2026-10-30',
      start: '10:00',
    });
    await assert.rejects(
      svc.scanRound(user, { factory: 'AJ2', shift: 'กะเช้า', stationId: 'quality' }),
      { status: 403 },
    );
    await database.prepare('UPDATE workspace SET config=?').run(JSON.stringify(DEFAULT_CONFIG));
    const state = await svc.getState(user, { factory: 'AJ2', shift: 'กะเช้า', date: '2026-10-30' });
    assert.ok(state.rounds.some((r) => r.id === dayId));
    assert.ok(state.rounds.every((r) => r.line === 'Line 8'));
    assert.deepEqual(state.reports, []);
    assert.deepEqual(state.members, []);
    await assert.rejects(svc.getState(user, { factory: 'AJ2', shift: 'กะดึก' }), { status: 403 });
    const body = {
      roundId: dayId,
      orderId: DEFAULT_CONFIG.orders[0].id,
      stationId: 'quality',
      payload: { values: { po: '36', pri: '24', mv: '61.2' } },
      expectedVersion: 0,
      requestId: 'qr-station-request-success',
    };
    await assert.rejects(svc.saveSubmission(user, { ...body, roundId: nightId }), { status: 403 });
    await assert.rejects(svc.saveSubmission(user, { ...body, roundId: otherLine }), {
      status: 403,
    });
    await assert.rejects(svc.saveSubmission(user, { ...body, stationId: 'production' }), {
      status: 403,
    });
    await assert.rejects(svc.updateConfig(user, DEFAULT_CONFIG, 1), { status: 403 });
    await assert.rejects(
      svc.backfillRound(user, {
        factory: 'AJ2',
        shift: 'กะดึก',
        line: 'Line 8',
        stationId: 'quality',
        date: '2026-10-29',
        start: '21:00',
      }),
      { status: 403 },
    );
    await svc.saveSubmission(user, body);
    const saved = await database.prepare('SELECT * FROM submissions WHERE round_id=?').get(dayId);
    assert.equal(saved.operator_id, quality.id);
    assert.match(saved.operator_name, /QA คุณภาพ/);
    await database.prepare('UPDATE members SET active=0 WHERE id=?').run(quality.id);
    await assert.rejects(async () => await stationAccount(database, scope), { status: 403 });
    await assert.rejects(svc.member(), { status: 403 });
  } finally {
    await database.close();
    assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep));
    assert.ok(resolve(folder).split(sep).at(-1).startsWith('qa-station-accounts-'));
    await rm(folder, { recursive: true, force: true });
  }
});
