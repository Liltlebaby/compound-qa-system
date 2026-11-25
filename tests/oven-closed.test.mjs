import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './helpers/database.mjs';
import { createService } from '../dist/server/service.mjs';
import * as D from '../src/shared/domain.mjs';
import { reportShareText } from '../src/shared/report-format.mjs';

function payload(order) {
  return D.prepareOvenPayload(
    {
      values: Object.fromEntries(
        D.OVENS.flatMap((b) => [
          [b + '_burner1', '138.1'],
          [b + '_biscuit', '17.22'],
          [b + '_temp', '50.6'],
        ]),
      ),
      notes: '',
    },
    D.ovenSettingDefaults(order),
  );
}
function close(data, b) {
  data.closedOvens = [...(data.closedOvens || []), b];
  for (const key of ['burner1', 'biscuit', 'temp']) data.values[b + '_' + key] = 'NA';
  return data;
}
test('closed ovens are explicit, not zero: validate active ovens, reject hidden readings and malformed states', () => {
  const cfg = structuredClone(D.DEFAULT_CONFIG),
    order = cfg.orders[0],
    p = payload(order);
  close(p, 'D');
  assert.deepEqual(D.validatePayload('oven', p, cfg, order), []);
  assert.equal(D.submissionCheck('oven', p, cfg, order).required, 9);
  assert.deepEqual(D.reviewIssues('oven', p, cfg, order), []);
  p.values.D_burner1 = '0';
  assert.match(D.validatePayload('oven', p, cfg, order).join('\n'), /เตาปิดต้องไม่มีค่าตรวจจริง/);
  p.values.D_burner1 = 'NA';
  p.values.A_burner1 = '';
  assert.ok(D.validatePayload('oven', p, cfg, order).length);
  for (const closedOvens of ['D', ['E'], ['D', 'D'], { D: true }])
    assert.match(
      D.validatePayload('oven', { ...payload(order), closedOvens }, cfg, order).join('\n'),
      /สถานะเตาปิด/,
    );
  const all = payload(order);
  for (const b of D.OVENS) close(all, b);
  assert.deepEqual(D.validatePayload('oven', all, cfg, order), []);
  assert.equal(D.submissionCheck('oven', all, cfg, order).required, 0);
});
test('PostgreSQL stores closed status, resolves that oven alarm, revises reports immutably, and reopening requires readings', async () => {
  const { database, adapter } = await openDatabase();
  const cfg = { ...structuredClone(D.DEFAULT_CONFIG), requiredStations: ['oven'] },
    order = cfg.orders[0];
  order.limits = { oven: { D_burner1: { min: 130, max: 140 } } };
  const admin = { id: 'admin', role: 'supervisor', name: 'Admin' },
    qa = { id: 'qa', role: 'qa', name: 'QA', stations: ['oven'], factories: ['AJ2'] };
  try {
    await database
      .prepare('INSERT INTO workspace(id,owner_id,config,version) VALUES(1,?,?,1)')
      .run(admin.id, JSON.stringify(cfg));
    const svc = createService(adapter, async () => null, {
      clock: () => '2026-11-03T10:15:00+07:00',
    });
    const roundId = await svc.createRound(admin, {
      factory: 'AJ2',
      shift: 'กะเช้า',
      date: '2026-11-03',
      start: '09:30',
    });
    const body = (p, v = 0) => ({
      roundId,
      orderId: order.id,
      stationId: 'oven',
      payload: p,
      expectedVersion: v,
      reason: v ? 'แก้สถานะเตา' : '',
      requestId: crypto.randomUUID(),
    });
    const first = payload(order);
    first.values.D_burner1 = '200';
    first.confirmation = 'ตรวจพบค่าจริง';
    await svc.saveSubmission(qa, body(first));
    await svc.generateReports();
    const before = (
      await database
        .prepare('SELECT facts FROM reports WHERE round_id=? AND revision=1')
        .get(roundId)
    ).facts;
    const off = close(payload(order), 'D');
    await svc.saveSubmission(qa, body(off, 1));
    await svc.generateReports();
    const state = await svc.getState(admin, {
      factory: 'AJ2',
      shift: 'กะเช้า',
      date: '2026-11-03',
    });
    const saved = state.submissions.find((e) => e.roundId === roundId);
    assert.deepEqual(saved.payload.closedOvens, ['D']);
    assert.equal(saved.payload.values.D_burner1, 'NA');
    const alarm = state.alarms.find((a) => a.roundId === roundId && a.fieldKey === 'D_burner1');
    assert.equal(alarm.status, 'resolved');
    assert.match(alarm.resolutionNote, /เตา D ปิด/);
    const report = state.reports.find((r) => r.roundId === roundId && r.revision === 2),
      round = state.rounds.find((r) => r.id === roundId);
    assert.match(report.text, /เตา D: เตาปิด/);
    assert.match(reportShareText(round, report), /เตา D · เตาปิด/);
    assert.equal(
      (
        await database
          .prepare('SELECT facts FROM reports WHERE round_id=? AND revision=1')
          .get(roundId)
      ).facts,
      before,
    );
    assert.equal(JSON.parse(before)[0].entries.oven.payload.values.D_burner1, '200');
    const reopen = {
      ...off,
      closedOvens: [],
      values: { ...off.values, D_burner1: '', D_biscuit: '', D_temp: '' },
    };
    await assert.rejects(svc.saveSubmission(qa, body(reopen, 2)), (e) => e.status === 422);
    await svc.saveSubmission(qa, body(payload(order), 2));
    assert.equal(D.isOvenClosed(payload(order), 'D'), false);
  } finally {
    await database.close();
  }
});
