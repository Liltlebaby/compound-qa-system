import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, stationQrScope } from '../src/shared/domain.mjs';
import { QR_GROUPS, qrAddress, qrPosters, posterSvg } from '../src/features/qr/poster-model.mjs';

test('print labels separate all 15 factory, shift and department scopes and retain live mode', () => {
  const posters = QR_GROUPS.flatMap((group) =>
    qrPosters(
      { ...DEFAULT_CONFIG, factory: group.factory, shift: group.shift },
      'http://192.168.1.50:5173',
      false,
    ),
  );
  assert.equal(posters.length, 15);
  assert.equal(new Set(posters.map((poster) => poster.url)).size, 15);
  assert.equal(new Set(posters.map((poster) => poster.labelId)).size, 15);
  for (const poster of posters) {
    const url = new URL(poster.url),
      scope = stationQrScope(url.search);
    assert.deepEqual(scope, {
      factory: poster.factory,
      shift: poster.shift,
      line: 'Line 8',
      stationId: poster.stationId,
    });
    assert.equal(url.searchParams.get('mode'), 'live');
    assert.equal(url.searchParams.has('demo'), false);
    assert.match(posterSvg(poster), new RegExp(poster.factory));
    assert.match(posterSvg(poster), /shape-rendering="crispEdges"/);
  }
  const filtered = qrPosters(
    { ...DEFAULT_CONFIG, line: 'Line 2', requiredStations: ['quality'] },
    'https://qa.example.com',
    false,
  );
  assert.equal(filtered.length, 1);
  assert.equal(stationQrScope(new URL(filtered[0].url).search).line, 'Line 2');
  assert.equal(filtered[0].number, '02');
});

test('print URLs reject unusable local hosts and exported labels escape editable text', () => {
  for (const value of [
    '',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://[::1]',
    'javascript:alert(1)',
    'https://user:password@example.com',
  ])
    assert.equal(qrAddress(value), null);
  assert.equal(qrAddress('https://qa.example.com/?view=qr'), 'https://qa.example.com');
  const poster = qrPosters(
    { ...DEFAULT_CONFIG, line: 'Line <8> & QA' },
    'https://qa.example.com',
    true,
  )[0];
  const svg = posterSvg(poster);
  assert.match(svg, /Line &lt;8&gt; &amp; QA/);
  assert.doesNotMatch(svg, /<8>/);
  assert.match(svg, /ข้อมูลสาธิต/);
  assert.equal(new URL(poster.url).searchParams.get('demo'), '1');
});
