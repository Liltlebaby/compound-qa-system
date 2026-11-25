import {
  ApiError,
  requireFactory as canFactory,
  requireStationScope as canScope,
  requireStation as canStation,
  requireSupervisor as supervisor,
} from '../shared/access.mjs';
import * as domain from '../shared/domain.mjs';
import { alarmStatements } from './alarm-service.mjs';
export { ApiError } from '../shared/access.mjs';
type Row = Record<string, any>;
interface Prepared {
  bind(...args: any[]): Prepared;
  all<T = Row>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
interface Database {
  transaction?<T>(action: () => Promise<T>, lockKeys?: string[]): Promise<T>;
  prepare(sql: string): Prepared;
  batch(
    statements: Prepared[],
    options?: { lockKeys?: string[]; requireChanges?: number[] },
  ): Promise<any[]>;
}
export function createService(
  binding: Database,
  identityProvider: () => Promise<any>,
  integrations: Row = {},
) {
  const D: any = domain;
  const transaction = <T>(action: () => Promise<T>, keys: string[]) =>
    binding.transaction ? binding.transaction(action, keys) : action();
  const env: any = {
    OPENAI_API_KEY: integrations.apiKey || '',
    OPENAI_MODEL: integrations.model || 'gpt-5-mini',
  };
  function db(): Database {
    return binding;
  }
  function unpack(row: Row): Row {
    const result: Row = {};
    for (const [k, v] of Object.entries(row))
      result[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
    for (const k of [
      'config',
      'snapshot',
      'payload',
      'facts',
      'stations',
      'factories',
      'before',
      'after',
      'changes',
      'details',
    ])
      if (typeof result[k] === 'string') {
        try {
          result[k] = JSON.parse(result[k]);
        } catch {}
      }
    return result;
  }
  async function rows(sql: string, ...args: any[]): Promise<Row[]> {
    const r = await db()
      .prepare(sql)
      .bind(...args)
      .all<Row>();
    return r.results.map(unpack);
  }
  async function one(sql: string, ...args: any[]): Promise<Row | undefined> {
    return (await rows(sql, ...args))[0];
  }
  const uuid = () => crypto.randomUUID();
  const now = () => new Date(integrations.clock?.() ?? Date.now()).toISOString();
  const encode = (v: any) => JSON.stringify(v);
  const stamp = () =>
    new Date().toLocaleString('th-TH-u-ca-gregory', { timeZone: 'Asia/Bangkok', hour12: false });
  async function sha(value: string) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(b))
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
  }
  async function member(): Promise<Row> {
    const identity = await identityProvider();
    if (!identity) throw new ApiError(401, 'กรุณาเข้าสู่ระบบเพื่อบันทึกข้อมูลจริง');
    const email = identity.email.toLowerCase().trim(),
      id = identity.userId;
    await db()
      .prepare(
        'INSERT INTO workspace (id,owner_id,config,version) VALUES (1,?,?,1) ON CONFLICT DO NOTHING',
      )
      .bind(id, encode(D.DEFAULT_CONFIG))
      .run();
    const w = await one('SELECT * FROM workspace WHERE id=1');
    if (w?.ownerId === id)
      await db()
        .prepare(
          'INSERT INTO members (id,email,name,role,stations,active) VALUES (?,?,?,?,?,1) ON CONFLICT DO NOTHING',
        )
        .bind(
          id,
          email,
          identity.displayName || email,
          'supervisor',
          encode(D.STATIONS.map((s: any) => s.id)),
        )
        .run();
    const m = await one('SELECT * FROM members WHERE email=?', email);
    if (!m || !m.active)
      throw new ApiError(403, 'บัญชีนี้ยังไม่ได้รับสิทธิ์ กรุณาให้หัวหน้าเพิ่มอีเมลในหน้าตั้งค่า');
    if (m.id.startsWith('invite:'))
      await db().prepare('UPDATE members SET id=? WHERE id=?').bind(id, m.id).run();
    else if (m.id !== id) throw new ApiError(403, 'บัญชีพนักงานไม่ตรงกับผู้เข้าสู่ระบบ');
    return {
      ...m,
      id,
      ...(identity.stationScope
        ? {
            role: 'qa',
            stations: [identity.stationScope.stationId],
            factories: [identity.stationScope.factory],
            accountType: 'station',
            stationScope: identity.stationScope,
          }
        : {}),
    };
  }
  function scopeOf(input: Row = {}) {
    const factory = String(input.factory || 'AJ2'),
      shift = String(input.shift || 'กะเช้า');
    if (
      !D.FACTORIES.includes(factory) ||
      !D.FACTORY_SHIFTS[factory]?.some((s: Row) => s.name === shift)
    )
      throw new ApiError(422, 'โรงงานหรือกะไม่ถูกต้อง');
    return { factory, shift };
  }
  function planFor(w: Row, input: Row = {}) {
    const { factory, shift } = scopeOf(input);
    const supplied = w.config.profiles?.[factory + '|' + shift];
    const base =
      supplied || (factory === 'AJ2' && shift === 'กะเช้า' ? w.config : D.DEFAULT_CONFIG);
    const { profiles, ...plan } = structuredClone(base);
    return D.knownOvenTime({
      ...plan,
      factory,
      shift,
      reviewRules: { requireExplanation: true, ...plan.reviewRules },
      schedule: D.scheduleFor({ ...plan, factory, shift }),
    });
  }
  async function settingsAudit(user: Row, action: string, details: any) {
    await db()
      .prepare('INSERT INTO settings_audits (id,actor_id,at,action,details) VALUES (?,?,?,?,?)')
      .bind(uuid(), user.id, now(), action, encode(details))
      .run();
  }
  async function getState(user: Row, input: Row = {}) {
    await ensureAutomaticRounds();
    const scope = scopeOf(input);
    canFactory(user, scope.factory);
    canScope(user, scope);
    const w = await one('SELECT * FROM workspace WHERE id=1'),
      config = planFor(w!, scope);
    const selectedDate =
      input.date === undefined ? D.productionDate(config, new Date(now())) : input.date;
    if (!D.validProductionDate(selectedDate))
      throw new ApiError(422, 'วันที่ไม่ถูกต้อง กรุณาเลือกวันที่จากปฏิทิน');
    const where = 'factory=? AND shift=? AND date=?' + (user.stationScope ? ' AND line=?' : '');
    const roundScope = 'SELECT id FROM rounds WHERE ' + where + ' ORDER BY end_at DESC LIMIT 200';
    const args = [
      scope.factory,
      scope.shift,
      selectedDate,
      ...(user.stationScope ? [user.stationScope.line] : []),
    ];
    const [rounds, submissions, reports, audits, members] = await Promise.all([
      rows('SELECT * FROM rounds WHERE ' + where + ' ORDER BY end_at DESC LIMIT 200', ...args),
      rows('SELECT * FROM submissions WHERE round_id IN (' + roundScope + ')', ...args),
      user.role === 'supervisor'
        ? rows(
            'SELECT * FROM reports WHERE round_id IN (' +
              roundScope +
              ') ORDER BY created_at DESC LIMIT 300',
            ...args,
          )
        : Promise.resolve([]),
      user.role === 'supervisor'
        ? rows(
            'SELECT * FROM audits WHERE round_id IN (' +
              roundScope +
              ') ORDER BY at DESC LIMIT 500',
            ...args,
          )
        : rows(
            'SELECT * FROM audits WHERE actor_id=? AND round_id IN (' +
              roundScope +
              ') ORDER BY at DESC LIMIT 200',
            user.id,
            ...args,
          ),
      user.role === 'supervisor'
        ? rows('SELECT * FROM members ORDER BY role DESC,name')
        : Promise.resolve([]),
    ]);
    const ovenEvents = await rows(
      'SELECT * FROM oven_setting_events WHERE factory=? AND shift=? ORDER BY effective_at,created_at',
      scope.factory,
      scope.shift,
    );
    const ovenSettings = Object.fromEntries(
      rounds.flatMap((r) =>
        r.snapshot.orders.map((o: Row) => [
          r.id + ':' + o.id,
          D.resolveOvenSettings(r, o, ovenEvents),
        ]),
      ),
    );
    const stationFilter =
      user.role === 'supervisor'
        ? ''
        : ' AND station_id IN (' + user.stations.map(() => '?').join(',') + ')';
    const alarmArgs = [...args, ...(user.role === 'supervisor' ? [] : user.stations)];
    const alarms = await rows(
      'SELECT * FROM qa_alarms WHERE round_id IN (' +
        roundScope +
        ')' +
        stationFilter +
        ' ORDER BY updated_at DESC LIMIT 1000',
      ...alarmArgs,
    );
    const alarmEvents = alarms.length
      ? await rows(
          'SELECT * FROM qa_alarm_events WHERE alarm_id IN (' +
            alarms.map(() => '?').join(',') +
            ') ORDER BY at DESC LIMIT 2000',
          ...alarms.map((a) => a.id),
        )
      : [];
    const shiftSchedules = D.FACTORY_SHIFTS[scope.factory].map((s: Row) => ({
      name: s.name,
      ...D.scheduleFor(planFor(w!, { factory: scope.factory, shift: s.name })),
    }));
    return {
      config,
      configVersion: w!.version,
      user,
      scope,
      selectedDate,
      ovenSettings,
      catalog: D.FACTORY_SHIFTS,
      shiftSchedules,
      alarms,
      alarmEvents,
      rounds,
      submissions:
        user.role === 'supervisor'
          ? submissions
          : submissions.filter((s) => user.stations.includes(s.stationId)),
      reports,
      audits,
      members,
      demo: false,
      progress: Object.fromEntries(rounds.map((r) => [r.id, D.readiness(r, submissions)])),
      integrations: { ai: Boolean((env as any).OPENAI_API_KEY), whatsapp: false },
      serverTime: now(),
    };
  }
  async function updateConfig(user: Row, config: any, version: number) {
    supervisor(user);
    const errors = D.validateConfig(config);
    if (errors.length) throw new ApiError(422, errors.join('\n'));
    if (encode(config).length > 100000) throw new ApiError(422, 'การตั้งค่ามีขนาดใหญ่เกินไป');
    const scope = scopeOf(config);
    canFactory(user, scope.factory);
    const prior = await one('SELECT * FROM workspace WHERE id=1');
    const previousPlan = planFor(prior!, scope);
    config = D.withOvenEpochs(previousPlan, config, uuid);
    const rootConfig = {
      ...prior!.config,
      profiles: { ...prior!.config.profiles, [scope.factory + '|' + scope.shift]: config },
    };
    const result = await db()
      .prepare('UPDATE workspace SET config=?,version=version+1 WHERE id=1 AND version=?')
      .bind(encode(rootConfig), version)
      .run();
    if (!result.meta.changes)
      throw new ApiError(409, 'การตั้งค่าถูกแก้จากเครื่องอื่น กรุณาโหลดใหม่');
    await settingsAudit(user, 'config', config);
    await ensureAutomaticRounds();
  }
  async function createRound(user: Row, body: Row) {
    supervisor(user);
    const scope = scopeOf(body);
    canFactory(user, scope.factory);
    const w = await one('SELECT * FROM workspace WHERE id=1');
    const config = planFor(w!, scope);
    if (config.requiredStations.includes('oven') && !config.unitConfirmed)
      throw new ApiError(422, 'ยืนยันชื่อและหน่วย Burner / Biscuit ในตั้งค่าก่อนเปิดรอบจริง');
    const date = String(body.date || ''),
      start = String(body.start || ''),
      shift = String(body.shift || '').trim();
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^(?:[01]\d|2[0-3]):(?:00|30)$/.test(start) ||
      !shift ||
      shift.length > 80
    )
      throw new ApiError(422, 'วันที่ กะ หรือเวลาไม่ถูกต้อง รอบต้องเริ่มนาที 00 หรือ 30');
    const end = D.roundTiming(config, date, start);
    if (
      !Number.isFinite(Date.parse(end.endAt)) ||
      D.bangkokDate(new Date(date + 'T12:00:00+07:00')) !== date
    )
      throw new ApiError(422, 'วันที่ไม่ถูกต้อง');
    const roundId = (
      await sha(scope.factory + '|' + date + '|' + shift + '|' + config.line + '|' + start)
    ).slice(0, 32);
    await db()
      .prepare(
        'INSERT INTO rounds (id,date,factory,shift,line,start,"end",end_at,snapshot,created_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING',
      )
      .bind(
        roundId,
        date,
        scope.factory,
        shift,
        config.line,
        start,
        end.end,
        end.endAt,
        encode(config),
        now(),
      )
      .run();
    return roundId;
  }
  async function scanRound(user: Row, body: Row) {
    const station = String(body.stationId || '');
    canStation(user, station);
    const scope = scopeOf(body);
    canFactory(user, scope.factory);
    canScope(user, { ...scope, ...(body.line !== undefined ? { line: body.line } : {}) }, station);
    const w = await one('SELECT * FROM workspace WHERE id=1'),
      config = planFor(w!, scope);
    canScope(user, { ...scope, line: config.line }, station);
    const slot = D.currentSlot(config, new Date(now()));
    if (!slot)
      throw new ApiError(422, 'อยู่นอกเวลากะ หรือปิดเปิดรอบอัตโนมัติ กรุณาตรวจสอบเวลากะในตั้งค่า');
    if (body.line && body.line !== config.line)
      throw new ApiError(422, 'QR นี้เป็นของ ' + body.line + ' แต่แผนปัจจุบันใช้ ' + config.line);
    if (!config.requiredStations.includes(station))
      throw new ApiError(422, 'จุดตรวจนี้ไม่ได้เปิดใช้งานในแผนปัจจุบัน');
    // The QA may only open the server-derived current slot, using the approved plan.
    // Arbitrary dates, shifts and orders remain supervisor-only.
    return createRound(
      { role: 'supervisor' },
      { factory: scope.factory, ...slot, shift: scope.shift },
    );
  }
  async function backfillRound(user: Row, body: Row) {
    const station = String(body.stationId || '');
    canStation(user, station);
    const scope = scopeOf(body);
    canFactory(user, scope.factory);
    canScope(user, { ...scope, ...(body.line !== undefined ? { line: body.line } : {}) }, station);
    const date = String(body.date || ''),
      start = String(body.start || ''),
      line = String(body.line || '');
    const existing = await one(
      'SELECT * FROM rounds WHERE factory=? AND shift=? AND line=? AND date=? AND start=?',
      scope.factory,
      scope.shift,
      line,
      date,
      start,
    );
    if (existing) {
      if (!D.validProductionDate(date) || Date.parse(existing.endAt) > Date.parse(now()))
        throw new ApiError(422, 'เลือกได้เฉพาะรอบที่จบแล้ว');
      if (!existing.snapshot.requiredStations.includes(station))
        throw new ApiError(422, 'จุดตรวจนี้ไม่อยู่ในรอบที่เลือก');
      return existing.id;
    }
    const w = await one('SELECT * FROM workspace WHERE id=1'),
      config = planFor(w!, scope);
    const issue = D.backfillSlotIssue(config, date, start, new Date(now()));
    if (issue) throw new ApiError(422, issue);
    if (line !== config.line || !config.requiredStations.includes(station))
      throw new ApiError(422, 'ไลน์หรือจุดตรวจไม่ตรงกับแผนของโรงและกะนี้');
    if (body.confirmPlan !== true)
      throw new ApiError(422, 'รอบนี้ยังไม่มีแผนย้อนหลัง กรุณาตรวจสอบและยืนยันแผนที่จะใช้ก่อน');
    if (body.expectedConfigVersion !== w!.version)
      throw new ApiError(409, 'แผนถูกแก้ไข กรุณาโหลดวันที่นี้ใหม่และตรวจสอบแผนอีกครั้ง');
    const errors = D.validateConfig(config);
    if (errors.length) throw new ApiError(422, errors.join('\n'));
    if (config.requiredStations.includes('oven') && !config.unitConfirmed)
      throw new ApiError(422, 'ให้หัวหน้ายืนยันชื่อและหน่วย Burner / Biscuit ก่อนสร้างรอบย้อนหลัง');
    const at = now(),
      end = D.roundTiming(config, date, start),
      roundId = (
        await sha(scope.factory + '|' + date + '|' + scope.shift + '|' + line + '|' + start)
      ).slice(0, 32);
    const snapshot = {
      ...config,
      backfill: {
        createdAt: at,
        createdBy: user.id,
        source: 'confirmed-current-plan',
        configVersion: w!.version,
      },
    };
    const result = await db()
      .prepare(
        'INSERT INTO rounds (id,date,factory,shift,line,start,"end",end_at,snapshot,created_at) SELECT ?,?,?,?,?,?,?,?,?,? FROM workspace WHERE id=1 AND version=? ON CONFLICT DO NOTHING',
      )
      .bind(
        roundId,
        date,
        scope.factory,
        scope.shift,
        line,
        start,
        end.end,
        end.endAt,
        encode(snapshot),
        at,
        w!.version,
      )
      .run();
    if (!(await one('SELECT id FROM rounds WHERE id=?', roundId)))
      throw new ApiError(409, 'แผนเปลี่ยนระหว่างบันทึก กรุณาตรวจสอบใหม่');
    if (result.meta.changes)
      await settingsAudit(user, 'backfill-round', {
        roundId,
        date,
        start,
        factory: scope.factory,
        shift: scope.shift,
        planVersion: w!.version,
      });
    return roundId;
  }
  async function addRoundOrder(user: Row, body: Row) {
    supervisor(user);
    const round = await one('SELECT * FROM rounds WHERE id=?', body.roundId);
    if (!round) throw new ApiError(404, 'ไม่พบรอบ');
    canFactory(user, round.factory);
    const count = await one('SELECT COUNT(*) n FROM reports WHERE round_id=?', round.id);
    if (count?.n) throw new ApiError(409, 'รอบนี้ออกรายงานแล้ว กรุณาเปิดรอบใหม่สำหรับ SO ใหม่');
    const next = { ...round.snapshot, orders: [...round.snapshot.orders, body.order] };
    const errors = D.validateConfig(next);
    if (errors.length) throw new ApiError(422, errors.join('\n'));
    const result = await db()
      .prepare(
        'UPDATE rounds SET snapshot=? WHERE id=? AND snapshot=? AND NOT EXISTS (SELECT 1 FROM reports WHERE round_id=?)',
      )
      .bind(encode(next), round.id, encode(round.snapshot), round.id)
      .run();
    if (!result.meta.changes) throw new ApiError(409, 'รอบถูกแก้ไขระหว่างบันทึก กรุณาโหลดใหม่');
    await settingsAudit(user, 'add-round-order', { roundId: round.id, order: body.order });
  }
  async function saveSubmission(user: Row, body: Row) {
    const { roundId, orderId, stationId, expectedVersion, requestId } = body;
    let payload = body.payload;
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId))
      throw new ApiError(422, 'รหัสการส่งไม่ถูกต้อง');
    canStation(user, stationId);
    const bodyHash = await sha(encode(body));
    const replay = await one('SELECT * FROM requests WHERE id=?', requestId);
    if (replay) {
      if (replay.actorId !== user.id || replay.bodyHash !== bodyHash)
        throw new ApiError(409, 'รหัสการส่งนี้ถูกใช้กับข้อมูลอื่น');
      const a = await one('SELECT id FROM audits WHERE id=?', requestId);
      if (!a) throw new ApiError(409, 'ข้อมูลถูกแก้ไขจากเครื่องอื่น กรุณาตรวจทานแล้วส่งใหม่');
      return { replayed: true };
    }
    const round = await one('SELECT * FROM rounds WHERE id=?', roundId);
    if (!round) throw new ApiError(404, 'ไม่พบรอบการผลิต');
    canFactory(user, round.factory);
    canScope(user, round, stationId);
    const order = round.snapshot.orders.find((o: Row) => o.id === orderId);
    if (!order || !round.snapshot.requiredStations.includes(stationId))
      throw new ApiError(422, 'จุดตรวจหรืองานไม่อยู่ในรอบนี้');
    if (!payload || typeof payload.values !== 'object' || encode(payload).length > 50000)
      throw new ApiError(422, 'ข้อมูลฟอร์มไม่ถูกต้อง');
    const prior = await one(
      'SELECT * FROM submissions WHERE round_id=? AND order_id=? AND station_id=?',
      roundId,
      orderId,
      stationId,
    );
    let ovenGuardSQL = '',
      ovenGuardArgs: any[] = [],
      ovenSignature = '';
    const modernOven =
      stationId === 'oven' && round.snapshot.ovenEntryMode === 'measurements-and-settings';
    if (modernOven) {
      const changeErrors = D.validateOvenChanges(payload.ovenChanges);
      if (changeErrors.length) throw new ApiError(422, changeErrors.join('\n'));
      const events = await rows(
        "SELECT *,submission_id||':'||changes||':'||created_at AS row_sig FROM oven_setting_events WHERE factory=? AND shift=? AND line=? AND order_id=? ORDER BY effective_at,created_at,submission_id",
        round.factory,
        round.shift,
        round.line,
        order.id,
      );
      const effectiveAt = new Date(Date.parse(round.endAt) - 1800000).toISOString(),
        epoch = order.ovenSettingsEpoch || 'initial';
      ovenGuardSQL =
        "COALESCE((SELECT string_agg(sig,'|') FROM (SELECT submission_id||':'||changes||':'||created_at AS sig FROM oven_setting_events WHERE factory=? AND shift=? AND line=? AND order_id=? AND epoch=? AND effective_at<=? AND round_id<>? ORDER BY effective_at,created_at,submission_id)), '')";
      ovenGuardArgs = [
        round.factory,
        round.shift,
        round.line,
        order.id,
        epoch,
        effectiveAt,
        round.id,
      ];
      ovenSignature = events
        .filter((e) => e.epoch === epoch && e.effectiveAt <= effectiveAt && e.roundId !== round.id)
        .map((e) => e.rowSig)
        .join('|');
      const baseline = D.resolveOvenSettings(round, order, events);
      if (payload.ovenSettingsVersion !== JSON.stringify(baseline))
        throw new ApiError(
          409,
          'SV หรือเวลาอบยางมีการเปลี่ยนแปลง กรุณาเปิดฟอร์มและตรวจค่าตั้งล่าสุดก่อนส่งใหม่',
        );
      const normalized = D.prepareOvenPayload(payload, baseline);
      for (const b of D.OVENS)
        for (const [index, key] of [
          [0, 'sv'],
          [2, 'time'],
        ]) {
          const raw = payload.values[b + '_burner' + index],
            expected = normalized.values[b + '_burner' + index];
          if (
            raw !== undefined &&
            raw !== '' &&
            (key === 'sv'
              ? D.asNumber(raw) !== D.asNumber(expected)
              : D.durationSeconds(raw) !== D.durationSeconds(expected))
          )
            throw new ApiError(422, 'ค่า SV / เวลาอบยางต้องตรงกับรายการปรับค่าตั้ง');
        }
      payload = normalized;
    }
    const errors = D.validatePayload(stationId, payload, round.snapshot, order);
    if (errors.length) throw new ApiError(422, errors.join('\n'));
    const warnings = D.observations(stationId, payload, order, round.snapshot);
    if (warnings.length && !payload.confirmation?.trim())
      throw new ApiError(422, 'กรุณาระบุการยืนยันข้อสังเกตก่อนส่ง');
    if (!Number.isInteger(expectedVersion) || expectedVersion !== (prior?.version || 0))
      throw new ApiError(409, 'ข้อมูลถูกแก้ไขจากเครื่องอื่น กรุณาโหลดล่าสุดและตรวจทานอีกครั้ง');
    if (prior && !body.reason?.trim()) throw new ApiError(422, 'กรุณาระบุเหตุผลการแก้ไข');
    const at = now(),
      submissionId = prior?.id || uuid(),
      nextVersion = expectedVersion + 1;
    const alarmWrites = await alarmStatements(
      db(),
      round,
      order,
      stationId,
      payload,
      at,
      requestId,
      user,
    );
    const operatorName =
      user.name +
      (payload.replacementFor?.trim()
        ? ' (แทน ' + String(payload.replacementFor).trim().slice(0, 100) + ')'
        : '');
    try {
      const settingWrites = modernOven
        ? [
            Object.keys(payload.ovenChanges).length
              ? db()
                  .prepare(
                    'INSERT INTO oven_setting_events (submission_id,round_id,order_id,factory,shift,line,epoch,effective_at,changes,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM submissions WHERE last_request_id=?) ON CONFLICT(submission_id) DO UPDATE SET changes=excluded.changes,created_at=excluded.created_at',
                  )
                  .bind(
                    submissionId,
                    roundId,
                    orderId,
                    round.factory,
                    round.shift,
                    round.line,
                    order.ovenSettingsEpoch || 'initial',
                    new Date(Date.parse(round.endAt) - 1800000).toISOString(),
                    encode(payload.ovenChanges),
                    at,
                    requestId,
                  )
              : db()
                  .prepare(
                    'DELETE FROM oven_setting_events WHERE submission_id=? AND EXISTS (SELECT 1 FROM submissions WHERE last_request_id=?)',
                  )
                  .bind(submissionId, requestId),
          ]
        : [];
      const result = await db().batch(
        [
          db()
            .prepare(
              modernOven
                ? 'INSERT INTO requests (id,actor_id,body_hash,created_at) SELECT ?,?,?,? WHERE ' +
                    ovenGuardSQL +
                    '=?'
                : 'INSERT INTO requests (id,actor_id,body_hash,created_at) VALUES (?,?,?,?)',
            )
            .bind(
              requestId,
              user.id,
              bodyHash,
              at,
              ...(modernOven ? [...ovenGuardArgs, ovenSignature] : []),
            ),
          db()
            .prepare(
              'INSERT INTO submissions (id,round_id,order_id,station_id,payload,operator_id,operator_name,submitted_at,version,last_request_id) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM requests WHERE id=?) ON CONFLICT(round_id,order_id,station_id) DO UPDATE SET payload=excluded.payload,operator_id=excluded.operator_id,operator_name=excluded.operator_name,submitted_at=excluded.submitted_at,version=excluded.version,last_request_id=excluded.last_request_id WHERE submissions.version=?',
            )
            .bind(
              submissionId,
              roundId,
              orderId,
              stationId,
              encode(payload),
              user.id,
              operatorName,
              at,
              nextVersion,
              requestId,
              requestId,
              expectedVersion,
            ),
          db()
            .prepare(
              'INSERT INTO audits (id,submission_id,round_id,station_id,order_id,actor_id,actor_name,at,before,after,reason) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM submissions WHERE last_request_id=?)',
            )
            .bind(
              requestId,
              submissionId,
              roundId,
              stationId,
              orderId,
              user.id,
              operatorName,
              at,
              prior ? encode(prior.payload) : null,
              encode(payload),
              String(body.reason || 'ส่งครั้งแรก').slice(0, 500),
              requestId,
            ),
          ...settingWrites,
          ...alarmWrites,
        ],
        {
          requireChanges: [1],
          lockKeys: modernOven
            ? [JSON.stringify([round.factory, round.shift, round.line, orderId])]
            : [],
        },
      );
      if (!result[1].meta.changes)
        throw new ApiError(409, 'มีการแก้จากเครื่องอื่น กรุณาตรวจทานข้อมูลล่าสุด');
    } catch (e) {
      if (e instanceof ApiError) throw e;
      const existing = await one('SELECT * FROM requests WHERE id=?', requestId);
      if (existing?.bodyHash === bodyHash && existing?.actorId === user.id) {
        const a = await one('SELECT id FROM audits WHERE id=?', requestId);
        if (a) return { replayed: true };
      }
      throw e;
    }
    return { replayed: false };
  }
  async function acknowledgeAlarm(user: Row, body: Row) {
    supervisor(user);
    if (
      typeof body.id !== 'string' ||
      typeof body.requestId !== 'string' ||
      !/^[a-zA-Z0-9-]{16,80}$/.test(body.requestId) ||
      typeof body.note !== 'string' ||
      body.note.length > 500
    )
      throw new ApiError(422, 'ข้อมูลรับทราบ Alarm ไม่ถูกต้อง');
    const alarm = await one('SELECT * FROM qa_alarms WHERE id=?', body.id);
    if (!alarm) throw new ApiError(404, 'ไม่พบ Alarm');
    const round = await one('SELECT * FROM rounds WHERE id=?', alarm.roundId);
    canFactory(user, round!.factory);
    if (alarm.ackRequestId === body.requestId) return { ok: true };
    if (alarm.status !== 'open' || alarm.updatedAt !== body.updatedAt)
      throw new ApiError(409, 'Alarm เปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด');
    const at = now();
    const result = await db().batch([
      db()
        .prepare(
          "UPDATE qa_alarms SET status='acknowledged',acknowledged_by=?,acknowledged_name=?,acknowledged_at=?,ack_note=?,ack_request_id=?,updated_at=? WHERE id=? AND status='open' AND updated_at=?",
        )
        .bind(
          user.id,
          user.name,
          at,
          body.note.trim(),
          body.requestId,
          at,
          body.id,
          body.updatedAt,
        ),
      db()
        .prepare(
          'INSERT INTO qa_alarm_events SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM qa_alarms WHERE id=? AND ack_request_id=?)',
        )
        .bind(
          body.requestId,
          body.id,
          at,
          user.id,
          user.name,
          'acknowledged',
          body.note.trim(),
          body.id,
          body.requestId,
        ),
    ]);
    if (!result[0].meta.changes)
      throw new ApiError(409, 'มีผู้รับทราบหรือแก้ข้อมูลแล้ว กรุณาโหลดข้อมูลล่าสุด');
    return { ok: true };
  }
  async function resolveAlarm(user: Row, body: Row) {
    supervisor(user);
    if (
      typeof body.id !== 'string' ||
      typeof body.requestId !== 'string' ||
      !/^[a-zA-Z0-9-]{16,80}$/.test(body.requestId) ||
      typeof body.note !== 'string' ||
      !body.note.trim() ||
      body.note.length > 500
    )
      throw new ApiError(422, 'กรุณาระบุวิธีแก้ไข / ผลติดตาม ไม่เกิน 500 ตัวอักษร');
    const alarm = await one('SELECT * FROM qa_alarms WHERE id=?', body.id);
    if (!alarm) throw new ApiError(404, 'ไม่พบ Alarm');
    const round = await one('SELECT * FROM rounds WHERE id=?', alarm.roundId);
    canFactory(user, round!.factory);
    if (alarm.resolutionRequestId === body.requestId) return { ok: true };
    if (alarm.status === 'resolved' || alarm.updatedAt !== body.updatedAt)
      throw new ApiError(409, 'Alarm เปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด');
    const at = now(),
      note = body.note.trim();
    const result = await db().batch([
      db()
        .prepare(
          "UPDATE qa_alarms SET status='resolved',resolved_at=?,updated_at=?,resolution_method='manual',resolved_by=?,resolved_name=?,resolution_note=?,resolution_request_id=? WHERE id=? AND status<>'resolved' AND updated_at=?",
        )
        .bind(at, at, user.id, user.name, note, body.requestId, body.id, body.updatedAt),
      db()
        .prepare(
          'INSERT INTO qa_alarm_events SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM qa_alarms WHERE id=? AND resolution_request_id=?)',
        )
        .bind(
          body.requestId,
          body.id,
          at,
          user.id,
          user.name,
          'resolved',
          note,
          body.id,
          body.requestId,
        ),
    ]);
    if (!result[0].meta.changes)
      throw new ApiError(409, 'Alarm เปลี่ยนระหว่างบันทึก กรุณาโหลดข้อมูลล่าสุด');
    return { ok: true };
  }
  function shortReport(
    round: Row,
    entries: Row[],
    revision: number,
    changes: string,
    completedAt: string,
  ) {
    const lines = [
      'COMPOUND · ' + round.factory + ' · ' + D.displayDate(round.date) + ' · ' + round.shift,
      round.line + ' · รอบ ' + round.start + '–' + round.end + ' · ฉบับ ' + revision,
    ];
    if (changes) lines.push('ฉบับแก้ไข: ' + changes);
    for (const f of D.factsFor(round, entries)) {
      lines.push(
        '',
        f.order.customer + ' / ' + f.order.so,
        'ผลผลิต PB ' +
          (f.actual === null
            ? D.formatValue(f.entries.production?.payload.values.pb)
            : D.numberText(f.actual) + ' ตัน') +
          ' / เป้า ' +
          D.numberText(f.order.target) +
          ' ตัน' +
          (f.percentage === null ? '' : ' = ' + D.numberText(f.percentage) + '%'),
      );
      if (f.actual !== null && f.order.target > 0)
        lines.push(
          (f.actual < f.order.target
            ? 'ต่ำกว่า'
            : f.actual > f.order.target
              ? 'สูงกว่า'
              : 'เท่ากับ') +
            'เป้ารอบนี้' +
            (f.actual === f.order.target
              ? ''
              : ' ' + D.numberText(Math.abs(f.actual - f.order.target)) + ' ตัน'),
        );
      if (f.entries.quality)
        for (const k of ['po', 'pri', 'mv']) {
          const v = f.entries.quality.payload.values[k],
            n = D.asNumber(v),
            spec = f.order.specs[k];
          lines.push(
            k.toUpperCase() +
              ' ' +
              D.formatValue(v) +
              ' · ' +
              (!spec
                ? 'ไม่มีเกณฑ์สเปก'
                : n === null
                  ? 'ไม่ตัดสินผล'
                  : n >= spec[0] && n <= spec[1]
                    ? 'อยู่ในสเปก'
                    : 'นอกสเปก'),
          );
        }
      if (f.entries.oven) {
        for (const burner of D.OVENS)
          if (D.isOvenClosed(f.entries.oven.payload, burner))
            lines.push('เตา ' + burner + ': เตาปิด');
        lines.push(...D.ovenSettingsChangeText(f.entries.oven.payload));
      }
      const packing = f.entries.packing?.payload;
      if (packing)
        lines.push(
          'PACK ' +
            packing.packCustomer +
            '/' +
            packing.packSo +
            ': ' +
            D.formatValue(packing.values.packTotal, 'ลัง') +
            ' · STR ' +
            D.formatValue(packing.values.packStr) +
            ' / PB ' +
            D.formatValue(packing.values.packPb),
          'เข้าโกดัง ' +
            packing.warehouseCustomer +
            '/' +
            packing.warehouseSo +
            ': STR ' +
            D.formatValue(packing.values.warehouseStr) +
            ' / PB ' +
            D.formatValue(packing.values.warehousePb) +
            ' ลัง',
        );
      f.observations.forEach((s: string) => lines.push('ข้อสังเกต: ' + s));
      Object.values(f.checks || {}).forEach((check: any) =>
        check.issues
          .filter((i: Row) => i.kind === 'missing')
          .forEach((i: Row) => lines.push('ข้อมูลไม่มีตัวเลข: ' + i.message)),
      );
      for (const [s, e] of Object.entries<any>(f.entries)) {
        if (e.payload.notes?.trim())
          lines.push(
            'หมายเหตุ ' +
              D.STATIONS.find((x: Row) => x.id === s).name +
              ': ' +
              e.payload.notes.trim(),
          );
        if (e.payload.confirmation?.trim()) lines.push('ยืนยัน: ' + e.payload.confirmation.trim());
      }
    }
    lines.push(
      '',
      'ส่งครบทุกจุด · ข้อมูลครบ ' +
        new Date(completedAt).toLocaleString('th-TH-u-ca-gregory', {
          timeZone: 'Asia/Bangkok',
          hour12: false,
        }),
    );
    return lines.join('\n');
  }
  async function aiHighlights(facts: Row[]) {
    const key = (env as any).OPENAI_API_KEY;
    if (!key) return null;
    const highlights = facts
      .flatMap((f) => [
        {
          text:
            f.order.customer +
            '/' +
            f.order.so +
            ' ผลผลิต ' +
            D.numberText(f.actual) +
            ' ตัน · ' +
            D.numberText(f.percentage) +
            '%',
        },
        ...f.observations.map((text: string) => ({ text })),
      ])
      .map((h, i) => ({ id: 'fact' + i, ...h }));
    if (!highlights.length) return null;
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        signal: AbortSignal.timeout(18000),
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: encode({
          model: (env as any).OPENAI_MODEL || 'gpt-5-mini',
          store: false,
          instructions:
            'Select the most important factory production facts for the supervisor. Prioritize out-of-spec and inconsistent packing, then production. Return only IDs from the input. Never infer causes.',
          input: encode(highlights),
          max_output_tokens: 1200,
          text: {
            format: {
              type: 'json_schema',
              name: 'qa_highlights',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  ids: {
                    type: 'array',
                    items: { type: 'string', enum: highlights.map((h) => h.id) },
                  },
                },
                required: ['ids'],
                additionalProperties: false,
              },
            },
          },
        }),
      });
      if (!response.ok) return null;
      const result: any = await response.json();
      const text = result.output
        ?.flatMap((o: any) => o.content || [])
        .find((c: any) => c.type === 'output_text')?.text;
      const selected = JSON.parse(text).ids;
      if (
        !Array.isArray(selected) ||
        !selected.length ||
        selected.some((id: string) => !highlights.some((h) => h.id === id))
      )
        return null;
      return Array.from(new Set<string>(selected))
        .slice(0, 6)
        .map((id) => highlights.find((h) => h.id === id)!.text)
        .join('\n');
    } catch {
      return null;
    }
  }
  async function ensureAutomaticRounds() {
    const w = await one('SELECT * FROM workspace WHERE id=1');
    if (!w) return { opened: 0 };
    let opened = 0;
    for (const factory of D.FACTORIES)
      for (const shift of D.FACTORY_SHIFTS[factory]) {
        const scope = { factory, shift: shift.name },
          config = planFor(w, scope);
        if (D.autoRoundIssue(config)) continue;
        const slot = D.currentSlot(config, new Date(now()));
        if (!slot) continue;
        const exists = await one(
          'SELECT id FROM rounds WHERE factory=? AND shift=? AND line=? AND date=? AND start=?',
          factory,
          shift.name,
          config.line,
          slot.date,
          slot.start,
        );
        if (exists) continue;
        await createRound({ role: 'supervisor' }, { ...scope, ...slot });
        opened++;
      }
    return { opened };
  }
  async function generateReports() {
    const { opened } = await ensureAutomaticRounds();
    const pending = await rows(
      "SELECT r.* FROM rounds r WHERE r.end_at<=? AND (SELECT COUNT(*) FROM submissions s WHERE s.round_id=r.id)>=jsonb_array_length(r.snapshot::jsonb->'orders')*jsonb_array_length(r.snapshot::jsonb->'requiredStations') AND (NOT EXISTS (SELECT 1 FROM reports p WHERE p.round_id=r.id) OR (SELECT MAX(s.submitted_at) FROM submissions s WHERE s.round_id=r.id)>=(SELECT MAX(p.created_at) FROM reports p WHERE p.round_id=r.id)) ORDER BY (SELECT MAX(s.submitted_at) FROM submissions s WHERE s.round_id=r.id) DESC LIMIT 25",
      now(),
    );
    let generated = 0;
    for (const round of pending) {
      generated += await transaction(async () => {
        const entries = await rows('SELECT * FROM submissions WHERE round_id=?', round.id);
        if (!D.readiness(round, entries).complete) return 0;
        const fingerprint = await sha(
          entries
            .map((e) => e.id + ':' + e.version)
            .sort()
            .join('|'),
        );
        if (
          await one(
            'SELECT id FROM reports WHERE round_id=? AND fingerprint=?',
            round.id,
            fingerprint,
          )
        )
          return 0;
        const previous = await one(
          'SELECT * FROM reports WHERE round_id=? ORDER BY revision DESC LIMIT 1',
          round.id,
        );
        const revision = (previous?.revision || 0) + 1;
        const changed = previous
          ? entries
              .filter((e) => e.submittedAt > previous.createdAt)
              .map(
                (e) =>
                  D.STATIONS.find((s: Row) => s.id === e.stationId)?.name +
                  ' · ' +
                  round.snapshot.orders.find((o: Row) => o.id === e.orderId)?.so,
              )
          : [];
        const changes = changed.length
          ? changed.join(', ')
          : previous
            ? 'ข้อมูลจุดตรวจมีการแก้ไข'
            : '';
        const completedAt = entries
          .map((e) => e.submittedAt)
          .sort()
          .at(-1)!;
        const facts = D.factsFor(round, entries),
          highlight = await aiHighlights(facts);
        const text =
          (highlight ? 'ประเด็นสำคัญ (AI เลือกจากข้อเท็จจริง)\n' + highlight + '\n\n' : '') +
          shortReport(round, entries, revision, changes, completedAt);
        // Recheck that submissions are unchanged after the model call before committing.
        const latest = await rows('SELECT id,version FROM submissions WHERE round_id=?', round.id);
        if (
          (await sha(
            latest
              .map((e) => e.id + ':' + e.version)
              .sort()
              .join('|'),
          )) !== fingerprint
        )
          return 0;
        const result = await db()
          .prepare(
            'INSERT INTO reports (id,round_id,fingerprint,revision,text,source,completed_at,created_at,changes,facts) SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM submissions WHERE round_id=? AND submitted_at>?) ON CONFLICT DO NOTHING',
          )
          .bind(
            uuid(),
            round.id,
            fingerprint,
            revision,
            text,
            highlight ? 'ai' : 'standard',
            completedAt,
            now(),
            changes,
            encode(facts),
            round.id,
            completedAt,
          )
          .run();
        return result.meta.changes;
      }, ['round:' + round.id]);
    }
    return { generated, opened, checkedAt: stamp() };
  }
  async function saveMember(user: Row, body: Row) {
    supervisor(user);
    const email = String(body.email || '')
        .trim()
        .toLowerCase(),
      name = String(body.name || '').trim(),
      role = body.role;
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !name ||
      name.length > 100 ||
      !['qa', 'supervisor'].includes(role) ||
      !Array.isArray(body.stations) ||
      body.stations.some((s: string) => !D.STATIONS.some((x: Row) => x.id === s))
    )
      throw new ApiError(422, 'กรุณาระบุชื่อ อีเมล บทบาท และจุดตรวจให้ถูกต้อง');
    if (role === 'qa' && !body.stations.length)
      throw new ApiError(422, 'QA ต้องได้รับสิทธิ์อย่างน้อยหนึ่งจุด');
    const factories = body.factories || D.FACTORIES;
    if (
      !Array.isArray(factories) ||
      !factories.length ||
      factories.some((f: string) => !D.FACTORIES.includes(f))
    )
      throw new ApiError(422, 'กรุณาเลือกโรงงานที่อนุญาต');
    const prior = await one('SELECT * FROM members WHERE email=?', email),
      w = await one('SELECT owner_id FROM workspace WHERE id=1');
    if (prior?.id === w!.ownerId && (role !== 'supervisor' || body.active === false))
      throw new ApiError(422, 'ไม่สามารถปิดสิทธิ์เจ้าของระบบ');
    await db()
      .prepare(
        'INSERT INTO members (id,email,name,role,stations,active,factories) VALUES (?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,role=excluded.role,stations=excluded.stations,active=excluded.active,factories=excluded.factories',
      )
      .bind(
        prior?.id || 'invite:' + email,
        email,
        name,
        role,
        encode(body.stations),
        body.active === false ? 0 : 1,
        encode(factories),
      )
      .run();
    await settingsAudit(user, 'member', {
      email,
      name,
      role,
      stations: body.stations,
      factories,
      active: body.active !== false,
    });
  }

  return {
    ensureAutomaticRounds,
    member,
    getState,
    updateConfig,
    createRound,
    scanRound,
    backfillRound,
    addRoundOrder,
    saveSubmission: (user: Row, body: Row) =>
      transaction(() => saveSubmission(user, body), ['round:' + body.roundId]),
    acknowledgeAlarm: (user: Row, body: Row) =>
      transaction(() => acknowledgeAlarm(user, body), ['alarm:' + body.id]),
    resolveAlarm: (user: Row, body: Row) =>
      transaction(() => resolveAlarm(user, body), ['alarm:' + body.id]),
    generateReports,
    saveMember,
  };
}
