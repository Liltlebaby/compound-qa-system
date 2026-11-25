import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, stationQrScope, stationQrUrl } from '../src/shared/domain.mjs';
test('each factory and shift generates a distinct station QR with explicit scope', () => {
  const urls = new Set();
  for (const [factory, shift] of [
    ['AJ2', 'กะเช้า'],
    ['AJ2', 'กะดึก'],
    ['AJ2B', 'กะเช้า'],
  ]) {
    const config = { ...DEFAULT_CONFIG, factory, shift },
      url = stationQrUrl('http://192.168.1.50:5173', config, 'quality', true);
    assert.deepEqual(stationQrScope(new URL(url).search), {
      stationId: 'quality',
      factory,
      shift,
      line: 'Line 8',
    });
    assert.equal(new URL(url).searchParams.get('demo'), '1');
    urls.add(url);
  }
  assert.equal(urls.size, 3);
});
test('old or invalid QRs fail explicitly instead of choosing a remembered or different shift', () => {
  for (const query of [
    'station=quality&factory=AJ2&line=Line+8',
    'station=quality&factory=AJ2B&shift=กะดึก&line=Line+8',
    'station=wrong&factory=AJ2&shift=กะเช้า&line=Line+8',
    'station=quality&factory=wrong&shift=กะเช้า&line=Line+8',
  ])
    assert.throws(() => stationQrScope(query), /QR/);
});
test('live QR retains its factory and shift without switching to demo', () => {
  const url = new URL(
    stationQrUrl('https://qa.example.com', { ...DEFAULT_CONFIG, shift: 'กะดึก' }, 'oven', false),
  );
  assert.equal(url.searchParams.get('mode'), 'live');
  assert.equal(url.searchParams.has('demo'), false);
  assert.equal(stationQrScope(url.search).shift, 'กะดึก');
});
