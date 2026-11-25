/** Invalidation only: business data is always fetched again through the authorized state API. */
export function createLiveUpdates({ heartbeatMs = 15000 } = {}) {
  const clients = new Set();
  function connect(req, res, authorize) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 1500\nevent: ready\ndata: {}\n\n');
    let checking = false;
    const client = { res };
    const cleanup = () => {
      clearInterval(timer);
      clients.delete(client);
    };
    const timer = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        await authorize();
        if (!res.destroyed && !res.writableEnded && !res.write(': keep-alive\n\n')) res.destroy();
      } catch {
        res.end();
      } finally {
        checking = false;
      }
    }, heartbeatMs);
    timer.unref?.();
    res.once('close', cleanup);
    res.once('error', () => {
      cleanup();
      res.destroy();
    });
    req.once('aborted', cleanup);
    clients.add(client);
  }
  function publish() {
    for (const { res } of clients) {
      if (!res.destroyed && !res.writableEnded && !res.write('event: change\ndata: {}\n\n'))
        res.destroy();
    }
  }
  function close() {
    for (const { res } of clients) res.end();
    clients.clear();
  }
  return { connect, publish, close };
}
