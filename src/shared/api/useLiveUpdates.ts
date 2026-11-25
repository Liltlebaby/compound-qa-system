import { useEffect, useRef, useState } from 'react';

export default function useLiveUpdates({
  enabled,
  factory,
  shift,
  userId,
  onChange,
}: {
  enabled: boolean;
  factory: string;
  shift: string;
  userId: string;
  onChange: () => Promise<unknown>;
}) {
  const latest = useRef(onChange);
  latest.current = onChange;
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    setConnected(false);
    if (!enabled || !userId) return;
    let disposed = false,
      healthy = false,
      busy = false,
      dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stream: EventSource | undefined;
    async function refresh() {
      timer = undefined;
      if (disposed || !navigator.onLine) return;
      if (busy) {
        dirty = true;
        return;
      }
      busy = true;
      try {
        await latest.current();
      } finally {
        busy = false;
        if (dirty && !disposed) {
          dirty = false;
          schedule();
        }
      }
    }
    function schedule() {
      if (!disposed && timer === undefined) timer = setTimeout(refresh, 100);
    }
    try {
      stream = new EventSource(
        '/api/events?factory=' +
          encodeURIComponent(factory) +
          '&shift=' +
          encodeURIComponent(shift),
      );
      stream.addEventListener('ready', () => {
        if (disposed) return;
        healthy = true;
        setConnected(true);
        schedule(); // Fresh snapshot also catches changes missed while disconnected.
      });
      stream.addEventListener('change', schedule);
      stream.onerror = () => {
        healthy = false;
        if (!disposed) setConnected(false);
      };
    } catch {
      /* Polling below supports networks that do not keep an event stream open. */
    }
    const fallback = setInterval(() => {
      if (!healthy) schedule();
    }, 5000);
    const visible = () => {
      if (document.visibilityState === 'visible') schedule();
    };
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(fallback);
      stream?.close();
      window.removeEventListener('focus', schedule);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [enabled, factory, shift, userId]);
  return connected;
}
