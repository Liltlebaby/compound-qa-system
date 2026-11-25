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
  shiftStarts,
  backfillSlotIssue,
  latestCompletedSlot,
  fieldsFor,
} from '../src/shared/domain.mjs';
test('backfill permits only completed half-hour slots within the chosen shift, including overnight dates', () => {
  const at = new Date('2026-10-30T10:15:00+07:00'),
    night = { ...DEFAULT_CONFIG, shift: 'กะดึก' };
  assert.equal(shiftStarts(DEFAULT_CONFIG).length, 22);
  assert.equal(shiftStarts(night).length, 22);
  assert.equal(backfillSlotIssue(DEFAULT_CONFIG, '2026-10-30', '09:30', at), '');
  assert.ok(backfillSlotIssue(DEFAULT_CONFIG, '2026-10-30', '10:00', at));
  assert.ok(backfillSlotIssue(DEFAULT_CONFIG, '2026-10-29', '20:00', at));
  assert.ok(backfillSlotIssue(DEFAULT_CONFIG, '2026-02-30', '10:00', at));
  assert.equal(backfillSlotIssue(night, '2026-10-29', '07:30', at), '');
  assert.ok(backfillSlotIssue(night, '2026-10-30', '07:30', at));
  assert.deepEqual(latestCompletedSlot(night, at), {
    date: '2026-10-29',
    start: '07:30',
    end: '08:00',
    endAt: '2026-10-30T01:00:00.000Z',
  });
});
test('QA backfills authorized stations, preserves old specs, records actual timestamps, and revises completed reports', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'qa-backfill-'));
  const { database, adapter } = await openDatabase();
  const at = '2026-10-30T10:15:00+07:00',
    service = createService(adapter, async () => null, { clock: () => at }),
    admin = { id: 'admin', role: 'supervisor', name: 'Admin' },
    qa = { id: 'qa', name: 'QA actual', role: 'qa', factories: ['AJ2'], stations: ['production'] };
  const config = {
    ...structuredClone(DEFAULT_CONFIG),
    requiredStations: ['production', 'quality'],
  };
  config.profiles = { 'AJ2|กะดึก': { ...structuredClone(config), shift: 'กะดึก' } };
  await database
    .prepare('INSERT INTO workspace(id,owner_id,config,version) VALUES(1,?,?,1)')
    .run(admin.id, JSON.stringify(config));
  const base = {
    factory: 'AJ2',
    shift: 'กะเช้า',
    line: 'Line 8',
    date: '2026-10-29',
    start: '10:00',
    stationId: 'production',
  };
  try {
    const old = await service.createRound(admin, base);
    config.orders[0].target = 10;
    await database.prepare('UPDATE workspace SET config=?,version=2').run(JSON.stringify(config));
    assert.equal(await service.backfillRound(qa, base), old);
    assert.equal(
      JSON.parse(
        (await database.prepare('SELECT snapshot FROM rounds WHERE id=?').get(old)).snapshot,
      ).orders[0].target,
      8,
    );
    const missing = { ...base, start: '09:30' };
    await assert.rejects(service.backfillRound(qa, missing), (e) => e.status === 422);
    await assert.rejects(
      service.backfillRound(qa, { ...missing, confirmPlan: true, expectedConfigVersion: 1 }),
      (e) => e.status === 409,
    );
    const ids = await Promise.all([
      service.backfillRound(qa, {
        ...missing,
        confirmPlan: true,
        expectedConfigVersion: 2,
        snapshot: { orders: [{ target: 99 }] },
      }),
      service.backfillRound(qa, { ...missing, confirmPlan: true, expectedConfigVersion: 2 }),
    ]);
    assert.equal(ids[0], ids[1]);
    const created = await database.prepare('SELECT * FROM rounds WHERE id=?').get(ids[0]),
      snapshot = JSON.parse(created.snapshot);
    assert.equal(snapshot.orders[0].target, 10);
    assert.equal(snapshot.backfill.createdBy, qa.id);
    assert.equal(snapshot.backfill.createdAt, new Date(at).toISOString());
    assert.equal(created.date, '2026-10-29');
    assert.equal(
      (
        await database
          .prepare('SELECT COUNT(*) n FROM rounds WHERE date=? AND start=?')
          .get(missing.date, missing.start)
      ).n,
      1,
    );
    await assert.rejects(
      service.backfillRound(qa, { ...base, stationId: 'quality' }),
      (e) => e.status === 403,
    );
    await assert.rejects(
      service.backfillRound(qa, { ...base, factory: 'AJ2B' }),
      (e) => e.status === 403,
    );
    await assert.rejects(
      service.backfillRound(qa, {
        ...base,
        date: '2026-10-30',
        start: '10:00',
        confirmPlan: true,
        expectedConfigVersion: 2,
      }),
      (e) => e.status === 422,
    );
    await assert.rejects(
      service.backfillRound(qa, {
        ...missing,
        start: '20:00',
        confirmPlan: true,
        expectedConfigVersion: 2,
      }),
      (e) => e.status === 422,
    );
    const night = await service.backfillRound(qa, {
      ...base,
      shift: 'กะดึก',
      date: '2026-10-29',
      start: '07:30',
      confirmPlan: true,
      expectedConfigVersion: 2,
    });
    assert.equal(
      (await database.prepare('SELECT end_at FROM rounds WHERE id=?').get(night)).end_at,
      '2026-10-30T01:00:00.000Z',
    );
    const values = Object.fromEntries(
      fieldsFor('production', config, config.orders[0]).map((f) => [f.key, '0']),
    );
    values.pb = '6.30';
    const body = {
      roundId: old,
      orderId: config.orders[0].id,
      stationId: 'production',
      expectedVersion: 0,
      requestId: 'backfill-original-submit',
      payload: { values },
    };
    await service.saveSubmission(qa, body);
    await service.generateReports();
    assert.equal(
      (await database.prepare('SELECT COUNT(*) n FROM reports WHERE round_id=?').get(old)).n,
      0,
    );
    const submission = await database
      .prepare('SELECT * FROM submissions WHERE round_id=?')
      .get(old);
    assert.equal(submission.operator_name, 'QA actual');
    assert.equal(submission.submitted_at, new Date(at).toISOString());
    await service.saveSubmission(admin, {
      roundId: old,
      orderId: config.orders[0].id,
      stationId: 'quality',
      expectedVersion: 0,
      requestId: 'backfill-quality-submit',
      payload: { values: { po: '36', pri: '24', mv: '61.2' } },
    });
    await service.generateReports();
    assert.match(
      (await database.prepare('SELECT text FROM reports WHERE round_id=?').get(old)).text,
      /78.75%/,
    );
    await assert.rejects(
      service.saveSubmission(qa, {
        ...body,
        expectedVersion: 1,
        requestId: 'backfill-edit-without-reason',
        payload: { values: { ...values, pb: '7' } },
      }),
      (e) => e.status === 422,
    );
    await service.saveSubmission(qa, {
      ...body,
      expectedVersion: 1,
      requestId: 'backfill-edit-with-reason',
      reason: 'แก้ผลผลิตย้อนหลังตามใบตรวจ',
      payload: { values: { ...values, pb: '7' } },
    });
    await service.generateReports();
    const reports = await database
      .prepare('SELECT * FROM reports WHERE round_id=? ORDER BY revision')
      .all(old);
    assert.equal(reports.length, 2);
    assert.match(reports[1].text, /87.50%/);
    assert.equal(
      (await database.prepare('SELECT COUNT(*) n FROM audits WHERE round_id=?').get(old)).n,
      3,
    );
  } finally {
    await database.close();
    assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep));
    assert.ok(resolve(folder).split(sep).at(-1).startsWith('qa-backfill-'));
    await rm(folder, { recursive: true, force: true });
  }
});
