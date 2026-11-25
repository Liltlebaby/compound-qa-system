import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, completeDemoReport } from '../src/features/demo/demo.mjs';
import {
  reportShareText,
  qualityResult,
  allExplicitZero,
  reportValue,
  reportDuration,
} from '../src/shared/report-format.mjs';

test('readable share uses revision snapshots, retains separate SOs and true minutes/seconds', () => {
  const state = createDemo(),
    round = state.rounds[0],
    report = completeDemoReport(state, round.id).reports[0];
  const original = structuredClone(report),
    text = reportShareText(round, report);
  assert.match(text, /ผลผลิต PB 6\.30 ตัน\nเป้ารอบนี้ 8\.00 ตัน\nสำเร็จ 78\.75%/);
  assert.match(text, /ต่ำกว่าเป้ารอบนี้ 1\.70 ตัน/);
  assert.match(text, /เวลาอบ 6 นาที 15 วินาที/);
  assert.match(text, /\*PACK · MRF \/ 15694\*/);
  assert.match(text, /\*เข้าโกดัง · MRF \/ 15701\*/);
  assert.match(text, /จำนวน PACK 5 ลัง แต่ STR 0 \+ PB 4 = 4 ลัง/);
  assert.match(text, /ยาง Fail -/);
  state.submissions.find((s) => s.stationId === 'production').payload.values.pb = '999';
  round.snapshot.orders[0].specs.po = [100, 200];
  assert.equal(reportShareText(round, report), text);
  assert.deepEqual(report, original);
});
test('display distinguishes blank, NA, zero and missing PRI specification', () => {
  assert.equal(reportValue('NA', 'ตัน'), '-');
  assert.equal(reportDuration('NA'), '-');
  assert.equal(reportValue('0', 'ตัน'), '0 ตัน');
  assert.equal(reportValue(''), 'ยังไม่กรอก');
  assert.equal(allExplicitZero(['0', 0, '0.00']), true);
  assert.equal(allExplicitZero(['0', '']), false);
  assert.equal(allExplicitZero(['0', 'NA']), false);
  assert.equal(qualityResult('24', null).label, 'ไม่มีเกณฑ์สเปก');
  assert.equal(qualityResult('NA', [32, 42]).label, 'ไม่ตัดสินผล');
  assert.equal(qualityResult('0', [32, 42]).bad, true);
  const state = createDemo(),
    round = state.rounds[0],
    prod = state.submissions.find((s) => s.stationId === 'production');
  prod.payload.values.fail = '';
  prod.payload.values.metal = '0';
  const report = completeDemoReport(state, round.id).reports[0],
    text = reportShareText(round, report);
  assert.match(text, /ยาง Fail ยังไม่กรอก/);
  assert.match(text, /ยางโลหะ 0 ตัน/);
  assert.equal(reportShareText(round, { text: 'legacy report' }), 'legacy report');
});
