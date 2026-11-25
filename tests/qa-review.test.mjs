import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from '../src/shared/domain.mjs';
import { openDatabase } from './helpers/database.mjs';
import { createService } from '../dist/server/service.mjs';
test('missing numbers need field explanations; explanations cannot hide invalid numbers or turn missing into zero', () => {
  const cfg = structuredClone(D.DEFAULT_CONFIG),
    order = cfg.orders[0],
    payload = { values: { po: '36', pri: '', mv: '61.2' }, fieldExplanations: {} };
  assert.match(D.validatePayload('quality', payload, cfg, order).join('\n'), /คำอธิบาย/);
  payload.fieldExplanations.pri = 'เครื่องตรวจ PRI ขัดข้อง';
  assert.deepEqual(D.validatePayload('quality', payload, cfg, order), []);
  assert.equal(D.submissionCheck('quality', payload, cfg, order).explained, 1);
  assert.equal(D.submissionCheck('quality', payload, cfg, order).numeric, 2);
  for (const bad of ['-1', 'abc']) {
    payload.values.pri = bad;
    assert.ok(D.validatePayload('quality', payload, cfg, order).length);
  }
  payload.values.pri = 'NA';
  assert.equal(D.validatePayload('quality', payload, cfg, order).length, 0);
  payload.fieldExplanations.pri = 'x'.repeat(501);
  assert.ok(D.validatePayload('quality', payload, cfg, order).length);
  payload.values.pri = '0';
  payload.fieldExplanations = {};
  assert.equal(D.validatePayload('quality', payload, cfg, order).length, 0);
  const legacy = { ...cfg, reviewRules: { requireExplanation: false } };
  payload.values.pri = 'NA';
  assert.equal(D.validatePayload('quality', payload, legacy, order).length, 0);
});
test('limits are inclusive, zero bounds work, durations use seconds and invalid limits cannot be saved', () => {
  const cfg = structuredClone(D.DEFAULT_CONFIG),
    order = cfg.orders[0];
  order.limits = {
    production: { fail: { min: '0', max: '0' }, pb: { min: '6.3', max: '8' } },
    oven: { A_burner2: { min: '6.10', max: '6.15' } },
  };
  const fields = D.fieldsFor('production', cfg, order),
    fail = fields.find((f) => f.key === 'fail'),
    pb = fields.find((f) => f.key === 'pb'),
    time = D.fieldsFor('oven', cfg, order).find((f) => f.key === 'A_burner2');
  assert.equal(D.validateConfig(cfg).length, 0);
  assert.equal(D.fieldRangeIssue(fail, '0'), null);
  assert.equal(D.fieldRangeIssue(pb, '6.3'), null);
  assert.equal(D.fieldRangeIssue(pb, '8'), null);
  assert.equal(D.fieldRangeIssue(fail, '0.01').severity, 'critical');
  assert.equal(D.fieldRangeIssue(time, '6.15'), null);
  assert.ok(D.fieldRangeIssue(time, '6.16'));
  order.limits.production.pb.min = '9';
  assert.ok(D.validateConfig(cfg).length);
  order.limits.production.pb.min = '6.3';
  order.limits.oven.A_burner2.max = '6.60';
  assert.ok(D.validateConfig(cfg).length);
});
test('alarms persist atomically, deduplicate, retain acknowledgment, reopen on a new violation and resolve only after correction', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'qa-review-')),
    { database, adapter } = await openDatabase();
  let at = '2026-10-31T10:15:00+07:00';
  const cfg = structuredClone(D.DEFAULT_CONFIG),
    admin = { id: 'admin', name: 'หัวหน้าทดสอบ', role: 'supervisor' },
    qa = {
      id: 'quality-qa',
      name: 'QA คุณภาพ',
      role: 'qa',
      stations: ['quality'],
      factories: ['AJ2'],
    };
  try {
    await database
      .prepare('INSERT INTO workspace VALUES(1,?,?,1)')
      .run(admin.id, JSON.stringify(cfg));
    const svc = createService(adapter, async () => null, { clock: () => at });
    const roundId = await svc.createRound(admin, {
      factory: 'AJ2',
      shift: 'กะเช้า',
      date: '2026-10-31',
      start: '10:00',
    });
    const payload = {
      values: { po: '50', pri: 'NA', mv: '61.2' },
      fieldExplanations: { pri: 'เครื่องตรวจขัดข้อง' },
      confirmation: 'ตรวจซ้ำแล้ว ค่าที่พบจริง',
    };
    const body = {
      roundId,
      orderId: cfg.orders[0].id,
      stationId: 'quality',
      payload,
      expectedVersion: 0,
      requestId: 'review-first-submission-0001',
    };
    await svc.saveSubmission(qa, body);
    const first = await database.prepare('SELECT * FROM qa_alarms').all();
    assert.equal(first.length, 2);
    assert.ok(first.every((a) => a.status === 'open'));
    const count = async () =>
      (await database.prepare('SELECT COUNT(*) n FROM qa_alarm_events').get()).n;
    const initialEvents = await count();
    await svc.saveSubmission(qa, body);
    assert.equal(await count(), initialEvents);
    const query = { factory: 'AJ2', shift: 'กะเช้า', date: '2026-10-31' },
      get = async () => svc.getState(admin, query),
      po = (await get()).alarms.find((a) => a.fieldKey === 'po');
    assert.equal((await svc.getState({ ...qa, stations: ['production'] }, query)).alarms.length, 0);
    await assert.rejects(svc.acknowledgeAlarm(qa, { id: po.id }), { status: 403 });
    at = '2026-10-31T10:16:00+07:00';
    const ack = {
      id: po.id,
      updatedAt: po.updatedAt,
      requestId: 'review-acknowledgment-0001',
      note: 'ตรวจติดตามหน้างาน',
    };
    await svc.acknowledgeAlarm(admin, ack);
    await svc.acknowledgeAlarm(admin, ack);
    assert.equal(await count(), initialEvents + 1);
    assert.equal((await get()).alarms.find((a) => a.id === po.id).status, 'acknowledged');
    at = '2026-10-31T10:17:00+07:00';
    await svc.saveSubmission(qa, {
      ...body,
      expectedVersion: 1,
      requestId: 'review-unchanged-reading-0002',
      reason: 'เพิ่มหมายเหตุ',
      payload: { ...payload, notes: 'ติดตามแล้ว' },
    });
    assert.equal((await get()).alarms.find((a) => a.id === po.id).status, 'acknowledged');
    // A later config update must not reinterpret the earlier round.
    cfg.orders[0].specs.po = [0, 100];
    await database.prepare('UPDATE workspace SET config=?').run(JSON.stringify(cfg));
    at = '2026-10-31T10:18:00+07:00';
    await svc.saveSubmission(qa, {
      ...body,
      expectedVersion: 2,
      requestId: 'review-changed-reading-0003',
      reason: 'ตรวจซ้ำ',
      payload: { ...payload, values: { ...payload.values, po: '55' } },
    });
    const reopened = (await get()).alarms.find((a) => a.id === po.id);
    assert.equal(reopened.status, 'open');
    assert.equal(reopened.acknowledgedBy, null);
    assert.match(reopened.message, /42/);
    await assert.rejects(svc.resolveAlarm(qa, { id: po.id }), { status: 403 });
    await assert.rejects(
      svc.resolveAlarm(admin, { id: po.id, requestId: 'review-empty-resolution-0001', note: '' }),
      { status: 422 },
    );
    const action = {
      id: po.id,
      updatedAt: reopened.updatedAt,
      requestId: 'review-manual-resolution-0001',
      note: 'แยกล็อตและตรวจติดตามตามวิธีแก้ไข',
    };
    await svc.resolveAlarm(admin, action);
    const countBeforeReplay = await count();
    await svc.resolveAlarm(admin, action);
    assert.equal(await count(), countBeforeReplay);
    assert.equal(
      (
        await database.prepare('SELECT payload FROM submissions WHERE round_id=?').get(roundId)
      ).payload.includes('"po":"55"'),
      true,
      'closing an operational alarm never rewrites its original measurement',
    );
    at = '2026-10-31T10:18:10+07:00';
    await svc.saveSubmission(qa, {
      ...body,
      expectedVersion: 3,
      requestId: 'review-followup-notes-only-0004',
      reason: 'เพิ่มผลติดตาม',
      payload: { ...payload, values: { ...payload.values, po: '55' }, notes: 'แยกล็อตแล้ว' },
    });
    assert.equal(
      (await get()).alarms.find((a) => a.id === po.id).status,
      'resolved',
      'unchanged historical measurement stays manually resolved',
    );
    at = '2026-10-31T10:18:20+07:00';
    await svc.saveSubmission(qa, {
      ...body,
      expectedVersion: 4,
      requestId: 'review-new-violation-again-0005',
      reason: 'ตรวจซ้ำอีกครั้ง',
      payload: { ...payload, values: { ...payload.values, po: '56' } },
    });
    assert.equal((await get()).alarms.find((a) => a.id === po.id).status, 'open');
    at = '2026-10-31T10:19:00+07:00';
    await svc.saveSubmission(qa, {
      ...body,
      expectedVersion: 5,
      requestId: 'review-corrected-reading-0006',
      reason: 'ตรวจซ้ำหลังปรับเครื่อง',
      payload: { values: { po: '36', pri: '24', mv: '61.2' } },
    });
    const resolved = (await get()).alarms;
    assert.equal(resolved.length, 2);
    assert.ok(resolved.every((a) => a.status === 'resolved'));
    assert.ok((await get()).alarmEvents.some((e) => e.action === 'resolved'));
    const after = await count();
    await assert.rejects(
      svc.saveSubmission(qa, {
        ...body,
        expectedVersion: 1,
        requestId: 'review-stale-conflict-0005',
        reason: 'ร่างเก่า',
      }),
      { status: 409 },
    );
    assert.equal(await count(), after);
    await assert.rejects(
      svc.acknowledgeAlarm(admin, { ...ack, requestId: 'review-resolved-ack-0002' }),
      { status: 409 },
    );
  } finally {
    await database.close();
    assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep));
    assert.ok(resolve(folder).split(sep).at(-1).startsWith('qa-review-'));
    await rm(folder, { recursive: true, force: true });
  }
});
