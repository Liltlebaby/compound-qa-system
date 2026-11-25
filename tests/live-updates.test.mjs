import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createLiveUpdates } from '../src/server/live-updates.mjs';

test(
  'live stream delivers reconnect snapshot signal and data-free invalidation, then closes on access revocation',
  { timeout: 5000 },
  async () => {
    let allowed = true;
    const hub = createLiveUpdates({ heartbeatMs: 30 });
    const server = http.createServer((req, res) =>
      hub.connect(req, res, async () => {
        if (!allowed) throw new Error('session revoked');
      }),
    );
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const controller = new AbortController();
    try {
      const response = await fetch('http://127.0.0.1:' + server.address().port, {
        signal: controller.signal,
      });
      assert.match(response.headers.get('content-type'), /text\/event-stream/);
      assert.equal(response.headers.get('x-accel-buffering'), 'no');
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      assert.match(decoder.decode((await reader.read()).value), /event: ready\ndata: \{\}/);
      hub.publish();
      let text = '';
      while (!text.includes('event: change')) text += decoder.decode((await reader.read()).value);
      assert.match(text, /event: change\ndata: \{\}/);
      assert.doesNotMatch(text, /factory|roundId|payload|password|actual|customer/);
      allowed = false;
      while (!(await reader.read()).done) {}
      hub.publish(); // Disconnected clients do not cause writes to ended responses.
    } finally {
      controller.abort();
      hub.close();
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    }
  },
);
