import * as domain from '../shared/domain.mjs';
import type { DataRecord as Obj } from '../shared/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { completeDemoReport } from '../features/demo/demo.mjs';
import { demoForScope, firstRound, scopeKey } from '../features/rounds/round-state';
import { api, readLocal, removeLocal, shareReport, writeLocal } from '../shared/api/client';
import { reportShareText } from '../shared/report-format.mjs';
import useLiveUpdates from '../shared/api/useLiveUpdates';
const D: any = domain;

export function useQaWorkspace() {
  const followCurrent = useRef(true),
    formOpen = useRef(false),
    selectedRef = useRef(''),
    viewingDateRef = useRef<string | null>(null);
  const [viewingDate, setViewingDate] = useState<string | null>(null),
    [calendarOpen, setCalendarOpen] = useState(false);
  const [runtime, setRuntime] = useState<Obj | null>(null),
    [backfillPoint, setBackfillPoint] = useState('');
  const [scope, setScope] = useState<Obj>({ factory: 'AJ2', shift: 'กะเช้า' }),
    scopeRef = useRef<Obj>({ factory: 'AJ2', shift: 'กะเช้า' });
  const [scanStationId, setScanStationId] = useState(''),
    [scanScope, setScanScope] = useState<Obj | null>(null),
    [scanError, setScanError] = useState('');
  const [state, setState] = useState<any>(null),
    [demo, setDemo] = useState(true),
    [view, setView] = useState('dashboard'),
    [selected, setSelected] = useState(''),
    [orderId, setOrderId] = useState(''),
    [online, setOnline] = useState(true),
    [queue, setQueue] = useState<any[]>([]),
    [form, setForm] = useState<any>(null),
    [toast, setToast] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [newRound, setNewRound] = useState(false),
    [addingOrder, setAddingOrder] = useState(false),
    [history, setHistory] = useState<any>(null),
    [reportVersion, setReportVersion] = useState(''),
    [showMore, setShowMore] = useState(false),
    [authError, setAuthError] = useState(0);
  formOpen.current = Boolean(form);
  selectedRef.current = selected;
  const syncing = useRef(false),
    liveRequest = useRef(0),
    stateRef = useRef<any>(null),
    demoRef = useRef(true),
    qrHandled = useRef(false),
    toastTimer = useRef<any>(null);
  const lastAutomaticShift = useRef(''),
    seenAlarms = useRef(new Map<string, string>());
  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 6000);
  }, []);
  const updateState = useCallback((next: any) => {
    next = D.upgradeDemoOvenTime(next);
    if (next?.demo)
      next = {
        ...next,
        config: {
          ...next.config,
          reviewRules: { requireExplanation: true, ...next.config.reviewRules },
        },
      };
    stateRef.current = next;
    setState(next);
    if (!next) return;
    if (next.demo) writeLocal('demo-state:' + scopeKey(next.config), next);
    else if (next.user) {
      writeLocal(
        'state:' + next.user.id + ':' + scopeKey(next.config) + ':' + next.selectedDate,
        next,
      );
      if (!viewingDateRef.current)
        writeLocal('state:' + next.user.id + ':' + scopeKey(next.config), next);
      writeLocal('last-user', next.user.id);
    }
  }, []);
  function saveQueue(next: any[]) {
    if (!writeLocal('queue', next))
      throw new Error('เก็บข้อมูลบนเครื่องไม่ได้ กรุณาตรวจพื้นที่จัดเก็บ');
    setQueue(next);
  }
  async function loadLive(initial = false) {
    const requested = { ...scopeRef.current },
      requestedDate = viewingDateRef.current,
      request = ++liveRequest.current;
    try {
      const data = await api(
        'state?factory=' +
          encodeURIComponent(requested.factory) +
          '&shift=' +
          encodeURIComponent(requested.shift) +
          (requestedDate ? '&date=' + requestedDate : ''),
      );
      if (
        demoRef.current ||
        request !== liveRequest.current ||
        scopeKey(requested) !== scopeKey(scopeRef.current) ||
        requestedDate !== viewingDateRef.current
      )
        return null;
      if (!initial && formOpen.current && data.selectedDate !== stateRef.current?.selectedDate)
        return data;
      updateState(data);
      setAuthError(0);
      setError('');
      if (initial || (followCurrent.current && !formOpen.current))
        setSelected(
          firstRound(
            data,
            viewingDateRef.current || data.selectedDate || D.productionDate(data.config),
          ),
        );
      return data;
    } catch (e: any) {
      if (
        demoRef.current ||
        request !== liveRequest.current ||
        scopeKey(requested) !== scopeKey(scopeRef.current) ||
        requestedDate !== viewingDateRef.current
      )
        return null;
      setAuthError(e.status || 0);
      if (!navigator.onLine) {
        const id = readLocal('last-user', ''),
          cached = readLocal(
            'state:' + id + ':' + scopeKey(requested) + (requestedDate ? ':' + requestedDate : ''),
            null,
          );
        if (cached) {
          updateState(cached);
          if (initial) setSelected(firstRound(cached));
          setError('ออฟไลน์ · แสดงข้อมูลที่บันทึกไว้บนเครื่อง');
          return cached;
        }
      }
      setError(e.message);
      return null;
    }
  }
  const realtimeConnected = useLiveUpdates({
    enabled: !demo && online && Boolean(state?.user),
    factory: scope.factory,
    shift: scope.shift,
    userId: state?.user?.id || '',
    onChange: () => loadLive(),
  });
  async function openLive(scanned: Obj | null) {
    if (scanned && navigator.onLine) {
      try {
        await api('auth/station', scanned);
      } catch (e: any) {
        setError(e.message);
        setAuthError(e.status || 401);
        return null;
      }
    }
    return loadLive(true);
  }
  async function switchMode(nextDemo: boolean) {
    followCurrent.current = !viewingDateRef.current;
    setLoading(true);
    setForm(null);
    setView(scanStationId ? 'stations' : 'dashboard');
    setDemo(nextDemo);
    demoRef.current = nextDemo;
    setError('');
    qrHandled.current = false;
    setReportVersion('');
    const url = new URL(window.location.href);
    if (nextDemo) {
      url.searchParams.set('demo', '1');
      url.searchParams.delete('mode');
    } else {
      url.searchParams.set('mode', 'live');
      url.searchParams.delete('demo');
    }
    window.history.replaceState({}, '', url);
    writeLocal('mode', nextDemo ? 'demo' : 'live');
    if (nextDemo) {
      const data = D.ensureDemoRound(
        readLocal('demo-state:' + scopeKey(scopeRef.current), null) ||
          demoForScope(scopeRef.current),
      );
      updateState(data);
      setSelected(
        firstRound(
          data,
          viewingDateRef.current || data.selectedDate || D.productionDate(data.config),
        ),
      );
      setAuthError(0);
    } else {
      updateState(null);
      await openLive(scanScope);
    }
    setLoading(false);
  }
  useEffect(() => {
    api('runtime')
      .then(setRuntime)
      .catch(() => {});
    const q = new URLSearchParams(window.location.search);
    const date = q.get('date');
    if (date && D.validProductionDate(date) && date <= D.bangkokDate()) {
      viewingDateRef.current = date;
      setViewingDate(date);
      followCurrent.current = false;
    }
    const saved = readLocal('scope', { factory: 'AJ2', shift: 'กะเช้า' });
    if (q.has('station')) {
      try {
        setScanScope(D.stationQrScope(q.toString()));
      } catch (e: any) {
        setScanError(e.message);
        setLoading(false);
        return;
      }
    }
    const factory = D.FACTORIES.includes(q.get('factory'))
      ? q.get('factory')
      : D.FACTORIES.includes(saved.factory)
        ? saved.factory
        : 'AJ2';
    const options = D.FACTORY_SHIFTS[factory];
    const requested = q.get('shift') || (saved.factory === factory ? saved.shift : '');
    const selectedShift = options.some((s: Obj) => s.name === requested)
      ? requested
      : options[0].name;
    scopeRef.current = { factory, shift: selectedShift };
    setScope(scopeRef.current);
    const isDemo = q.has('demo') || (!q.has('mode') && readLocal('mode', 'demo') === 'demo');
    demoRef.current = isDemo;
    setDemo(isDemo);
    setOnline(navigator.onLine);
    setQueue(readLocal('queue', []));
    if (q.get('view') === 'qr' && !q.get('station')) setView('qr');
    if (q.get('station')) setScanStationId(q.get('station') || '');
    if (isDemo) {
      const data = D.ensureDemoRound(
        readLocal('demo-state:' + scopeKey(scopeRef.current), null) ||
          demoForScope(scopeRef.current),
      );
      updateState(data);
      setSelected(
        firstRound(
          data,
          viewingDateRef.current || data.selectedDate || D.productionDate(data.config),
        ),
      );
      setLoading(false);
    } else
      openLive(q.has('station') ? D.stationQrScope(q.toString()) : null).finally(() =>
        setLoading(false),
      );
    const change = () => setOnline(navigator.onLine);
    window.addEventListener('online', change);
    window.addEventListener('offline', change);
    const storage = (e: StorageEvent) => {
      if (e.key?.endsWith('queue')) setQueue(readLocal('queue', []));
    };
    window.addEventListener('storage', storage);
    if ('serviceWorker' in navigator) {
      if ((import.meta as any).env?.DEV)
        navigator.serviceWorker
          .getRegistrations()
          .then((all) => Promise.all(all.map((r) => r.unregister())))
          .catch(() => {});
      else navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    return () => {
      window.removeEventListener('online', change);
      window.removeEventListener('offline', change);
      window.removeEventListener('storage', storage);
      clearTimeout(toastTimer.current);
    };
  }, []);
  const flush = useCallback(async () => {
    if (syncing.current || demoRef.current || !navigator.onLine || !stateRef.current?.user) return;
    const run = async () => {
      syncing.current = true;
      try {
        let list = readLocal('queue', []);
        for (const item of [...list]) {
          if (
            item.actorId !== stateRef.current.user.id ||
            item.status === 'conflict' ||
            item.status === 'invalid'
          )
            continue;
          try {
            await api('submissions', item.body);
            list = readLocal('queue', []).filter((x: Obj) => x.id !== item.id);
            saveQueue(list);
            removeLocal(item.draftKey);
            notify(
              'ส่งข้อมูล ' +
                D.STATIONS.find((s: Obj) => s.id === item.body.stationId)?.name +
                ' สำเร็จแล้ว',
            );
          } catch (e: any) {
            if (e.status === 401 || e.status === 403) {
              setAuthError(e.status);
              setError(e.message);
              break;
            }
            if (e.status === 409 || e.status === 422) {
              list = readLocal('queue', []).map((x: Obj) =>
                x.id === item.id
                  ? { ...x, status: e.status === 409 ? 'conflict' : 'invalid', error: e.message }
                  : x,
              );
              saveQueue(list);
              notify('มีข้อมูลรอให้ตรวจทานก่อนส่งใหม่');
              continue;
            }
            break;
          }
        }
        await api('tick', {}).catch(() => {});
        await loadLive();
      } finally {
        syncing.current = false;
      }
    };
    if (navigator.locks) await navigator.locks.request('compound-qa-sync', run);
    else await run();
  }, [notify]);
  useEffect(() => {
    if (demo || !state?.user || !online) return;
    flush();
    const timer = setInterval(flush, 30000);
    return () => clearInterval(timer);
  }, [demo, online, state?.user?.id, flush]);
  useEffect(() => {
    if (!demo || !state?.user) return;
    const timer = setInterval(() => {
      const prev = stateRef.current;
      if (!prev?.demo) return;
      let next = D.ensureDemoRound(prev);
      for (const r of next.rounds)
        if (Date.parse(r.endAt) <= Date.now() && D.readiness(r, next.submissions).complete)
          next = completeDemoReport(next, r.id);
      if (next !== prev) updateState(next);
      if (followCurrent.current && !formOpen.current && firstRound(next) !== selectedRef.current)
        setSelected(firstRound(next));
    }, 1000);
    return () => clearInterval(timer);
  }, [demo, state?.user?.id, updateState]);
  useEffect(() => {
    if (!state?.alarms || viewingDate) return;
    let fresh = 0;
    for (const alarm of state.alarms) {
      if (alarm.status === 'resolved') {
        seenAlarms.current.delete(alarm.id);
        continue;
      }
      const signature = JSON.stringify(alarm.details);
      if (alarm.status === 'open' && seenAlarms.current.get(alarm.id) !== signature) fresh++;
      seenAlarms.current.set(alarm.id, signature);
    }
    if (fresh) notify('ALARM · พบ ' + fresh + ' รายการใหม่ กรุณาตรวจข้อมูล');
  }, [state?.alarms, viewingDate, notify]);
  const displayedDate = state
    ? viewingDate ||
      (form ? state.rounds.find((r: Obj) => r.id === selected)?.date : null) ||
      (demo ? D.productionDate(state.config) : state.selectedDate) ||
      D.productionDate(state.config)
    : D.bangkokDate();
  const visibleRounds = state ? D.roundsOnDate(state.rounds, displayedDate) : [];
  const alarms = (state?.alarms || []).filter(
    (a: Obj) =>
      visibleRounds.some((r: Obj) => r.id === a.roundId) &&
      (state.user.role === 'supervisor' || state.user.stations.includes(a.stationId)),
  );
  const activeAlarmCount = alarms.filter((a: Obj) => a.status !== 'resolved').length;
  const round = state?.rounds.find((r: Obj) => r.id === selected),
    order = round?.snapshot.orders.find((o: Obj) => o.id === orderId) || round?.snapshot.orders[0];
  const currentEntries = state?.submissions.filter((s: Obj) => s.roundId === selected) || [];
  const entries = currentEntries.filter((s: Obj) => s.orderId === order?.id);
  const progress = round ? state.progress?.[round.id] || D.readiness(round, currentEntries) : null;
  const facts = round ? D.factsFor(round, currentEntries) : [];
  const fact = facts.find((f: Obj) => f.order.id === order?.id);
  const supervisor = state?.user.role === 'supervisor';
  const myQueue = queue.filter(
    (q) =>
      q.actorId === state?.user.id &&
      (!scanScope ||
        (q.factory === scanScope.factory &&
          q.shift === scanScope.shift &&
          q.body.stationId === scanScope.stationId)),
  );
  const stationList = state
    ? D.STATIONS.filter(
        (s: Obj) =>
          (round ? round.snapshot.requiredStations : state.config.requiredStations).includes(
            s.id,
          ) &&
          (supervisor || state.user.stations.includes(s.id)) &&
          (!scanStationId || s.id === scanStationId),
      )
    : [];
  const roundReports =
    state?.reports
      .filter((r: Obj) => r.roundId === selected)
      .sort((a: Obj, b: Obj) => b.revision - a.revision) || [];
  const report = roundReports.find((r: Obj) => r.id === reportVersion) || roundReports[0];
  const reportEntries =
    roundReports[0]?.facts?.flatMap((f: Obj) => Object.values(f.entries || {})) || [];
  const stale =
    round &&
    roundReports[0] &&
    (reportEntries.length
      ? currentEntries.some(
          (e: Obj) =>
            !reportEntries.some((old: any) => old.id === e.id && old.version === e.version),
        )
      : currentEntries.some((e: Obj) => e.submittedAt > roundReports[0].createdAt));
  const closed = round ? Date.parse(round.endAt) <= Date.now() : false;
  const reportReady = Boolean(report && !stale && progress?.complete && closed);
  const warnings = fact?.observations || [];
  const oldRound = round && !demo && !D.isCurrentRound(round, state.config);
  function openForm(station: any, pending?: any) {
    if (!round || !order) {
      notify('กรุณาเลือกรอบการผลิตก่อน');
      return;
    }
    setForm({ station, pending });
  }
  useEffect(() => {
    if (!state || scanError || qrHandled.current) return;
    const q = new URLSearchParams(window.location.search),
      station = D.STATIONS.find((s: Obj) => s.id === q.get('station'));
    if (!station) return;
    qrHandled.current = true;
    const line = q.get('line');
    if (line && state.config.line !== line) {
      notify('QR นี้เป็นของ ' + line + ' แต่ระบบกำลังใช้ ' + state.config.line);
      setView('stations');
      return;
    }
    const recent = state.rounds
      .filter(
        (r: Obj) =>
          (!line || r.line === line) &&
          Date.parse(r.endAt) <= Date.now() &&
          Date.parse(r.endAt) >= Date.now() - 30 * 60000 &&
          !state.submissions.some((e: Obj) => e.roundId === r.id && e.stationId === station.id),
      )
      .sort((a: Obj, b: Obj) => b.endAt.localeCompare(a.endAt))[0];
    const historyRound = viewingDateRef.current
      ? D.roundsOnDate(state.rounds, viewingDateRef.current)
          .filter((r: Obj) => !line || r.line === line)
          .find((r: Obj) => r.id === q.get('round')) ||
        D.roundsOnDate(state.rounds, viewingDateRef.current).filter(
          (r: Obj) => !line || r.line === line,
        )[0]
      : null;
    const active = viewingDateRef.current
      ? historyRound
      : demo
        ? D.roundsOnDate(state.rounds, D.productionDate(state.config))[0]
        : recent ||
          state.rounds.find(
            (r: Obj) => D.isCurrentRound(r, state.config) && (!line || r.line === line),
          );
    if (!active) {
      setView('stations');
      if (viewingDateRef.current) {
        setError('ไม่มีรอบในวันที่เลือก กดกรอกย้อนหลังเพื่อเลือกหรือสร้างรอบในวันนั้น');
        return;
      }
      if (!demo && (supervisor || state.user.stations.includes(station.id))) {
        (async () => {
          try {
            const result = await api('scan-round', {
              stationId: station.id,
              line,
              factory: scopeRef.current.factory,
              shift: scopeRef.current.shift,
            });
            const latest = await loadLive();
            const r = latest?.rounds.find((r: Obj) => r.id === result.id);
            if (r) {
              setSelected(r.id);
              setOrderId(r.snapshot.orders[0].id);
              setForm({ station });
              notify('เปิดรอบปัจจุบันจากแผนผลิตแล้ว');
            }
          } catch (e: any) {
            setError(e.message);
          }
        })();
      } else {
        const schedule = D.scheduleFor(state.config);
        setError(
          'ยังไม่มีรอบที่เปิดให้กรอก · ' +
            scopeRef.current.factory +
            ' · ' +
            scopeRef.current.shift +
            ' เวลา ' +
            schedule.start +
            '–' +
            schedule.end +
            ' น. ระบบจะไม่เปลี่ยนไปกะอื่น',
        );
      }
      return;
    }
    setSelected(active.id);
    setOrderId(active.snapshot.orders[0].id);
    setView('stations');
    if (supervisor || state.user.stations.includes(station.id)) setForm({ station });
    else notify('บัญชีนี้ไม่ได้รับสิทธิ์จุดตรวจ ' + station.name);
  }, [state, demo, notify, supervisor, scanError]);
  async function switchScope(factory: string, shift: string) {
    if (scanScope) return;
    followCurrent.current = !viewingDateRef.current;
    setLoading(true);
    setForm(null);
    setSelected('');
    setOrderId('');
    setReportVersion('');
    setError('');
    qrHandled.current = false;
    const next = { factory, shift };
    scopeRef.current = next;
    setScope(next);
    writeLocal('scope', next);
    const u = new URL(window.location.href);
    u.searchParams.set('factory', factory);
    u.searchParams.set('shift', shift);
    window.history.replaceState({}, '', u);
    updateState(null);
    if (demoRef.current) {
      const data = D.ensureDemoRound(
        readLocal('demo-state:' + scopeKey(next), null) || demoForScope(next),
      );
      updateState(data);
      setSelected(
        firstRound(
          data,
          viewingDateRef.current || data.selectedDate || D.productionDate(data.config),
        ),
      );
    } else await loadLive(true);
    setLoading(false);
  }
  useEffect(() => {
    // Station QRs pin the shift. Leave active forms, history and settings in place.
    if (
      scanScope ||
      scanError ||
      viewingDate ||
      loading ||
      !state?.user ||
      form ||
      backfillPoint ||
      newRound ||
      addingOrder ||
      calendarOpen ||
      history ||
      !['dashboard', 'stations', 'reports', 'alarms'].includes(view)
    )
      return;
    const check = () => {
      const factory = scopeRef.current.factory,
        current = stateRef.current;
      if (!current) return;
      const schedules = demoRef.current
        ? D.FACTORY_SHIFTS[factory].map((s: Obj) => {
            const config =
              current.config.shift === s.name
                ? current.config
                : readLocal('demo-state:' + scopeKey({ factory, shift: s.name }), null)?.config;
            return { name: s.name, ...D.scheduleFor(config || { factory, shift: s.name }) };
          })
        : current.shiftSchedules || D.FACTORY_SHIFTS[factory];
      const active = D.activeShift(factory, new Date(), schedules);
      const key =
        factory + '|' + (active ? active.shift + '|' + active.date : 'พักกะ|' + D.bangkokDate());
      if (lastAutomaticShift.current === key) return;
      lastAutomaticShift.current = key;
      if (active && active.shift !== scopeRef.current.shift) {
        void switchScope(factory, active.shift)
          .then(() => notify('เปลี่ยนเป็น' + active.shift + 'อัตโนมัติตามเวลาเข้ากะ'))
          .catch(() => {
            setLoading(false);
            notify('เปลี่ยนกะไม่สำเร็จ กรุณาลองใหม่');
          });
      }
    };
    check();
    const timer = setInterval(check, 1000);
    const visible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', check);
    };
  }, [
    scanScope,
    scanError,
    viewingDate,
    loading,
    state?.user?.id,
    scope.factory,
    view,
    form,
    backfillPoint,
    newRound,
    addingOrder,
    calendarOpen,
    history,
    notify,
  ]);
  async function reviewPending(item: any) {
    if (
      item.factory &&
      item.shift &&
      (item.factory !== scopeRef.current.factory || item.shift !== scopeRef.current.shift)
    )
      await switchScope(item.factory, item.shift);
    if (item.date && item.date !== stateRef.current?.selectedDate) await chooseDate(item.date);
    const r = stateRef.current?.rounds.find((r: Obj) => r.id === item.body.roundId);
    if (!r) {
      notify('ไม่พบรอบ กรุณาเลือกวันที่ของรายการรอส่งจากปฏิทิน');
      return;
    }
    followCurrent.current = false;
    setSelected(r.id);
    setOrderId(item.body.orderId);
    setForm({ station: D.STATIONS.find((s: Obj) => s.id === item.body.stationId), pending: item });
  }
  async function chooseDate(date: string | null) {
    if (date && !D.validProductionDate(date)) throw new Error('วันที่ไม่ถูกต้อง');
    viewingDateRef.current = date;
    setViewingDate(date);
    followCurrent.current = !date;
    setCalendarOpen(false);
    setSelected('');
    setOrderId('');
    setReportVersion('');
    setForm(null);
    setError('');
    qrHandled.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete('round');
    if (date) url.searchParams.set('date', date);
    else url.searchParams.delete('date');
    if (!scanScope) {
      url.searchParams.delete('station');
      url.searchParams.delete('line');
      setScanStationId('');
    }
    window.history.replaceState({}, '', url);
    if (demoRef.current) {
      const data = D.ensureDemoRound(stateRef.current);
      updateState(data);
      setSelected(firstRound(data, date || D.productionDate(data.config)));
    } else {
      setLoading(true);
      updateState(null);
      await loadLive(true);
      setLoading(false);
    }
  }
  async function loadBackfillDay(date: string) {
    if (demoRef.current)
      return {
        ...stateRef.current,
        rounds: D.roundsOnDate(stateRef.current.rounds, date),
        serverTime: new Date().toISOString(),
      };
    try {
      return await api(
        'state?factory=' +
          encodeURIComponent(scopeRef.current.factory) +
          '&shift=' +
          encodeURIComponent(scopeRef.current.shift) +
          '&date=' +
          date,
      );
    } catch (e: any) {
      if (!navigator.onLine) {
        const cached = readLocal(
          'state:' + stateRef.current.user.id + ':' + scopeKey(scopeRef.current) + ':' + date,
          null,
        );
        if (cached) return cached;
      }
      throw e;
    }
  }
  async function openBackfill(body: any) {
    const prev = stateRef.current,
      backfillLine = scanScope?.line || stateRef.current.config.line,
      station = D.STATIONS.find((s: Obj) => s.id === body.stationId);
    if (!station) throw new Error('ไม่พบจุดตรวจ');
    if (scanScope && station.id !== scanScope.stationId) throw new Error('จุดตรวจต้องตรงกับ QR');
    let next: any, id: string;
    if (demoRef.current) {
      const existing = prev.rounds.find(
        (r: Obj) => r.date === body.date && r.start === body.start && r.line === backfillLine,
      );
      const issue = existing
        ? Date.parse(existing.endAt) > Date.now()
          ? 'เลือกได้เฉพาะรอบที่จบแล้ว'
          : ''
        : D.backfillSlotIssue(prev.config, body.date, body.start);
      if (issue) throw new Error(issue);
      if (existing) {
        id = existing.id;
        next = prev;
      } else {
        if (backfillLine !== prev.config.line)
          throw new Error(
            'แผนปัจจุบันไม่ใช่ไลน์ใน QR กรุณาเลือกเฉพาะรอบเดิมหรือให้หัวหน้าจัดแผนย้อนหลัง',
          );
        if (!body.confirmPlan) throw new Error('กรุณายืนยันแผนและสเปกก่อนสร้างรอบย้อนหลัง');
        id = D.uuid();
        const at = new Date().toISOString(),
          r = {
            id,
            date: body.date,
            start: body.start,
            ...D.roundTiming(prev.config, body.date, body.start),
            factory: scopeRef.current.factory,
            shift: scopeRef.current.shift,
            line: prev.config.line,
            snapshot: {
              ...structuredClone(prev.config),
              backfill: {
                createdAt: at,
                createdBy: prev.user.id,
                source: 'confirmed-current-plan',
                configVersion: prev.configVersion,
              },
            },
            createdAt: at,
          };
        next = { ...prev, rounds: [r, ...prev.rounds] };
      }
    } else {
      if (!navigator.onLine) {
        next = await loadBackfillDay(body.date);
        const existing = next.rounds.find(
          (r: Obj) => r.date === body.date && r.start === body.start && r.line === backfillLine,
        );
        if (!existing) throw new Error('การสร้างรอบย้อนหลังใหม่ต้องเชื่อมต่อเซิร์ฟเวอร์ก่อน');
        id = existing.id;
      } else {
        const result = await api('backfill-round', {
          ...body,
          factory: scopeRef.current.factory,
          shift: scopeRef.current.shift,
          line: backfillLine,
        });
        id = result.id;
        next = await loadBackfillDay(body.date);
      }
    }
    const target = next.rounds.find((r: Obj) => r.id === id);
    if (!target) throw new Error('โหลดรอบย้อนหลังไม่สำเร็จ กรุณาลองอีกครั้ง');
    if (!target.snapshot.requiredStations.includes(station.id))
      throw new Error('จุดตรวจนี้ไม่อยู่ในรอบที่เลือก');
    viewingDateRef.current = body.date;
    setViewingDate(body.date);
    followCurrent.current = false;
    qrHandled.current = true;
    setError('');
    updateState(next);
    setSelected(id);
    setOrderId(target.snapshot.orders[0].id);
    setView('stations');
    setForm({ station });
    setBackfillPoint('');
    const url = new URL(window.location.href);
    url.searchParams.set('date', body.date);
    url.searchParams.set('round', id);
    window.history.replaceState({}, '', url);
    notify('กำลังกรอกย้อนหลัง ' + body.date + ' · ' + body.start + '–' + target.end);
  }
  async function submit(body: any, key: string, replaces?: string) {
    if (demo) {
      const prev = stateRef.current,
        prior = prev.submissions.find(
          (s: Obj) =>
            s.roundId === body.roundId &&
            s.orderId === body.orderId &&
            s.stationId === body.stationId,
        );
      if ((prior?.version || 0) !== body.expectedVersion)
        throw new Error('ข้อมูลเปลี่ยนแล้ว กรุณาเปิดฟอร์มใหม่');
      const sub = {
        id: prior?.id || D.uuid(),
        ...body,
        version: (prior?.version || 0) + 1,
        operatorId: prev.user.id,
        operatorName:
          prev.user.name +
          (body.payload.replacementFor ? ' (แทน ' + body.payload.replacementFor + ')' : ''),
        submittedAt: new Date().toISOString(),
      };
      let next = {
        ...prev,
        submissions: [...prev.submissions.filter((s: Obj) => s.id !== sub.id), sub],
        audits: [
          {
            id: D.uuid(),
            submissionId: sub.id,
            roundId: body.roundId,
            stationId: body.stationId,
            orderId: body.orderId,
            actorName: sub.operatorName,
            at: sub.submittedAt,
            before: prior?.payload || null,
            after: body.payload,
            reason: body.reason || 'ส่งครั้งแรก',
          },
          ...prev.audits,
        ],
      };
      const r = next.rounds.find((r: Obj) => r.id === body.roundId);
      next = D.syncDemoAlarms(next, sub);
      if (D.readiness(r, next.submissions).complete && Date.parse(r.endAt) <= Date.now())
        next = completeDemoReport(next, r.id) as any;
      updateState(next);
      removeLocal(key);
      notify(
        'บันทึกข้อมูลสาธิตสำเร็จ' +
          (next.reports.length > prev.reports.length ? ' · สร้างรายงานแล้ว' : ''),
      );
      return;
    }
    const list = readLocal('queue', []),
      duplicate = list.find(
        (q: Obj) =>
          q.id !== replaces &&
          q.actorId === state.user.id &&
          q.body.roundId === body.roundId &&
          q.body.orderId === body.orderId &&
          q.body.stationId === body.stationId,
      );
    if (duplicate) throw new Error('จุดนี้มีข้อมูลรอส่งอยู่แล้ว กรุณาตรวจรายการรอส่งก่อน');
    const item = {
      date: round.date,
      factory: round.factory || round.snapshot.factory,
      shift: round.shift,
      id: body.requestId,
      actorId: state.user.id,
      body,
      draftKey: key,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    saveQueue([...list.filter((q: Obj) => q.id !== replaces), item]);
    if (navigator.onLine) {
      notify('เก็บข้อมูลแล้ว กำลังส่งเข้าส่วนกลาง');
      await flush();
    } else notify('เก็บบนเครื่องแล้ว · รอส่งเมื่ออินเทอร์เน็ตกลับมา');
  }
  async function mutate(path: string, body: any) {
    setBusy(true);
    try {
      const result = await api(path, body);
      await loadLive();
      return result;
    } finally {
      setBusy(false);
    }
  }
  async function acknowledge(alarm: Obj, note: string) {
    if (demo) {
      const at = new Date().toISOString(),
        prev = stateRef.current,
        current = prev.alarms.find((a: Obj) => a.id === alarm.id);
      if (!supervisor || current.status !== 'open' || current.updatedAt !== alarm.updatedAt)
        throw new Error('Alarm เปลี่ยนแล้ว กรุณาโหลดล่าสุด');
      updateState({
        ...prev,
        alarms: prev.alarms.map((a: Obj) =>
          a.id === alarm.id
            ? {
                ...a,
                status: 'acknowledged',
                acknowledgedBy: prev.user.id,
                acknowledgedName: prev.user.name,
                acknowledgedAt: at,
                ackNote: note,
                updatedAt: at,
              }
            : a,
        ),
        alarmEvents: [
          {
            id: D.uuid(),
            alarmId: alarm.id,
            action: 'acknowledged',
            actorName: prev.user.name,
            at,
            note,
          },
          ...(prev.alarmEvents || []),
        ],
      });
    } else
      await mutate('alarms/ack', {
        id: alarm.id,
        updatedAt: alarm.updatedAt,
        note,
        requestId: D.uuid(),
      });
    notify('รับทราบ Alarm แล้ว · ยังติดตามจนกว่าค่าจะเข้าเกณฑ์');
  }
  async function resolveQaAlarm(alarm: Obj, note: string) {
    if (!note.trim()) throw new Error('กรุณาระบุวิธีแก้ไข / ผลติดตาม');
    if (demo) {
      const at = new Date().toISOString(),
        prev = stateRef.current,
        current = prev.alarms.find((a: Obj) => a.id === alarm.id);
      if (!supervisor || current.status === 'resolved' || current.updatedAt !== alarm.updatedAt)
        throw new Error('Alarm เปลี่ยนแล้ว กรุณาโหลดล่าสุด');
      updateState({
        ...prev,
        alarms: prev.alarms.map((a: Obj) =>
          a.id === alarm.id
            ? {
                ...a,
                status: 'resolved',
                resolvedAt: at,
                resolutionMethod: 'manual',
                resolvedBy: prev.user.id,
                resolvedName: prev.user.name,
                resolutionNote: note,
                updatedAt: at,
              }
            : a,
        ),
        alarmEvents: [
          {
            id: D.uuid(),
            alarmId: alarm.id,
            action: 'resolved',
            actorName: prev.user.name,
            at,
            note,
          },
          ...(prev.alarmEvents || []),
        ],
      });
    } else
      await mutate('alarms/resolve', {
        id: alarm.id,
        updatedAt: alarm.updatedAt,
        note,
        requestId: D.uuid(),
      });
    notify('บันทึกการแก้ไขและปิด Alarm แล้ว · เก็บผลตรวจเดิมไว้');
  }
  async function saveConfig(config: any) {
    if (demo) {
      const errors = D.validateConfig(config);
      if (errors.length) throw new Error(errors.join('\n'));
      config = D.withOvenEpochs(stateRef.current.config, config);
      updateState(
        D.ensureDemoRound({
          ...stateRef.current,
          config,
          configVersion: stateRef.current.configVersion + 1,
        }),
      );
      notify('บันทึกการตั้งค่าสาธิตแล้ว · ใช้กับรอบใหม่');
      return;
    }
    await mutate('config', { config, version: state.configVersion });
    notify('บันทึกแล้ว · ใช้กับรอบใหม่');
  }
  async function createPeriod(body: any) {
    followCurrent.current = false;
    if (demo) {
      const { end, endAt } = D.roundTiming(state.config, body.date, body.start),
        id = D.uuid();
      const r = {
        id,
        ...body,
        factory: scope.factory,
        end,
        endAt,
        line: state.config.line,
        snapshot: structuredClone(state.config),
        createdAt: new Date().toISOString(),
      };
      updateState({ ...stateRef.current, rounds: [r, ...stateRef.current.rounds] });
      setSelected(id);
      await chooseDate(body.date);
    } else {
      const result = await mutate('rounds', {
        ...body,
        factory: scope.factory,
        shift: scope.shift,
      });
      await chooseDate(body.date);
      setSelected(result.id);
    }
    setNewRound(false);
    notify('เปิดรอบการผลิตแล้ว');
  }
  async function addOrderToRound(id: string) {
    const nextOrder = state.config.orders.find((o: Obj) => o.id === id);
    if (demo) {
      updateState({
        ...stateRef.current,
        rounds: stateRef.current.rounds.map((r: Obj) =>
          r.id === selected
            ? {
                ...r,
                snapshot: {
                  ...r.snapshot,
                  orders: [...r.snapshot.orders, structuredClone(nextOrder)],
                },
              }
            : r,
        ),
      });
    } else await mutate('round-order', { roundId: selected, order: nextOrder });
    setAddingOrder(false);
    setOrderId(id);
    notify('เพิ่ม SO ในรอบแล้ว ต้องส่งข้อมูลของ SO นี้ให้ครบทุกจุด');
  }
  async function share() {
    if (!reportReady || !supervisor) return;
    try {
      const msg = await shareReport(
        (demo ? '[ข้อมูลสาธิต]\n' : '') + reportShareText(round, report),
      );
      notify(msg);
    } catch {
      notify('แชร์ไม่สำเร็จ ใช้ปุ่มคัดลอกเพื่อส่งผ่าน WhatsApp ได้');
    }
  }
  async function copyReport() {
    try {
      await navigator.clipboard.writeText(
        (demo ? '[ข้อมูลสาธิต]\n' : '') + reportShareText(round, report),
      );
      notify('คัดลอกรายงานแล้ว');
    } catch {
      notify('คัดลอกไม่ได้ กรุณาเลือกรายงานแล้วคัดลอกด้วยตนเอง');
    }
  }
  function nav(v: string) {
    const u = new URL(window.location.href);
    if (!scanScope) {
      setScanStationId('');
      u.searchParams.delete('station');
      u.searchParams.delete('line');
    }
    window.history.replaceState({}, '', u);
    setView(v);
    setShowMore(false);
    setReportVersion('');
    window.scrollTo({ top: 0 });
  }
  const signInHref =
    typeof window === 'undefined'
      ? '/login?return_to=%2F'
      : '/login?return_to=' + encodeURIComponent(window.location.pathname + window.location.search);
  const heading =
    scanStationId && view === 'stations'
      ? 'จุดตรวจ · ' + (D.STATIONS.find((s: Obj) => s.id === scanStationId)?.name || 'QA')
      : (
          {
            dashboard: 'ภาพรวมการผลิต',
            stations: 'จุดตรวจ QA',
            reports: 'รายงานการผลิต',
            alarms: 'Alarm / แจ้งเตือน QA',
            qr: 'QR ประจำจุด',
            settings: 'ตั้งค่าระบบ',
          } as Obj
        )[view];
  return {
    followCurrent,
    viewingDateRef,
    viewingDate,
    calendarOpen,
    setCalendarOpen,
    runtime,
    realtimeConnected,
    backfillPoint,
    setBackfillPoint,
    scope,
    scopeRef,
    scanStationId,
    scanScope,
    scanError,
    state,
    demo,
    view,
    selected,
    setSelected,
    setOrderId,
    online,
    queue,
    form,
    setForm,
    toast,
    setToast,
    error,
    loading,
    busy,
    newRound,
    setNewRound,
    addingOrder,
    setAddingOrder,
    history,
    setHistory,
    reportVersion,
    setReportVersion,
    showMore,
    setShowMore,
    authError,
    stateRef,
    notify,
    updateState,
    loadLive,
    switchMode,
    flush,
    displayedDate,
    visibleRounds,
    alarms,
    activeAlarmCount,
    round,
    order,
    entries,
    progress,
    fact,
    supervisor,
    myQueue,
    stationList,
    roundReports,
    report,
    stale,
    closed,
    reportReady,
    warnings,
    oldRound,
    openForm,
    switchScope,
    reviewPending,
    chooseDate,
    loadBackfillDay,
    openBackfill,
    submit,
    mutate,
    acknowledge,
    resolveQaAlarm,
    saveConfig,
    createPeriod,
    addOrderToRound,
    share,
    copyReport,
    nav,
    signInHref,
    heading,
  };
}
