import {
  DEFAULT_CONFIG,
  STATIONS,
  DEFECTS,
  standardReport,
  factsFor,
  uuid,
} from '../../shared/domain.mjs';
export function createDemo() {
  const config = structuredClone(DEFAULT_CONFIG);
  const round = {
    id: 'demo-20261029-1000',
    date: '2026-10-29',
    factory: 'AJ2',
    shift: 'กะเช้า',
    line: 'Line 8',
    start: '10:00',
    end: '10:30',
    endAt: '2026-10-29T03:30:00.000Z',
    snapshot: structuredClone(config),
    createdAt: '2026-10-29T03:00:00.000Z',
  };
  const payloads = {
    quality: { values: { po: '36.0', pri: '24', mv: '61.2' }, notes: '' },
    production: {
      values: {
        pb: '6.30',
        fail: 'NA',
        metal: 'NA',
        ws: 'NA',
        mold: 'NA',
        sticky: 'NA',
        crate: 'NA',
        popri: 'NA',
        low: 'NA',
        dirty: 'NA',
      },
      notes:
        'สาธิต: ต้นทางไม่ระบุยอดยางเสีย จึงใช้ไม่เกี่ยวข้องเพื่อทดลองฟอร์ม กรุณายืนยันค่าจริงก่อนใช้งาน',
    },
    oven: {
      values: {
        A_burner0: '138',
        A_burner1: '138.1',
        A_burner2: '6.15',
        A_biscuit: '17.22',
        A_temp: '50.6',
        B_burner0: '138',
        B_burner1: '138.1',
        B_burner2: '6.15',
        B_biscuit: '17.16',
        B_temp: '52.5',
        C_burner0: '138.1',
        C_burner1: '138.1',
        C_burner2: '6.15',
        C_biscuit: '17.10',
        C_temp: '50.9',
        D_burner0: '138.1',
        D_burner1: '138.1',
        D_burner2: '6.15',
        D_biscuit: '17.26',
        D_temp: '51.7',
      },
      notes: '',
    },
    packing: {
      values: {
        packTotal: '5',
        packStr: '0',
        packPb: '4',
        warehouseStr: 'NA',
        warehousePb: '5',
        steam: '0',
        defectWs: '0',
        defectMold: '0',
        ct: '0',
        defectStr: '0',
        defectPb: '0',
      },
      packCustomer: 'MRF',
      packSo: '15694',
      warehouseCustomer: 'MRF',
      warehouseSo: '15701',
      defectCustomer: 'MRF',
      defectSo: '15701',
      notes: 'ข้อมูลตัวอย่างตามข้อความต้นทาง',
      confirmation: 'เก็บตัวเลขต้นทางไว้เพื่อสาธิตการแจ้งข้อสังเกต',
    },
  };
  payloads.production.fieldExplanations = Object.fromEntries(
    DEFECTS.map(([key]) => [key, 'ข้อมูลตัวอย่าง: ต้นทางไม่ระบุยอดยางเสียประเภทนี้']),
  );
  payloads.packing.fieldExplanations = {
    warehouseStr: 'ข้อมูลตัวอย่าง: ต้นทางไม่ระบุ STR เข้าโกดัง',
  };
  const names = {
    oven: 'QA เตาอบ',
    quality: 'สุดารัตน์ (แทน)',
    production: 'QA ผลผลิต',
    packing: 'QA PACK / โกดัง',
  };
  const submissions = Object.entries(payloads).map(([stationId, payload], i) => ({
    id: 'demo-' + stationId,
    roundId: round.id,
    orderId: config.orders[0].id,
    stationId,
    payload,
    operatorId: 'demo-' + stationId,
    operatorName: names[stationId],
    submittedAt: '2026-10-29T03:' + ['12', '18', '20', '25'][i] + ':00.000Z',
    version: 1,
  }));
  return {
    config,
    configVersion: 1,
    rounds: [round],
    submissions,
    reports: [],
    audits: [],
    members: [],
    user: {
      id: 'demo-supervisor',
      name: 'ผู้ทดลองใช้งาน',
      email: 'demo',
      role: 'supervisor',
      factories: ['AJ2', 'AJ2B'],
      stations: STATIONS.map((s) => s.id),
    },
    integrations: { ai: false, whatsapp: false },
    demo: true,
  };
}
export function completeDemoReport(state, roundId) {
  const round = state.rounds.find((r) => r.id === roundId),
    entries = state.submissions.filter((s) => s.roundId === roundId);
  const prev = state.reports
    .filter((r) => r.roundId === roundId)
    .sort((a, b) => b.revision - a.revision)[0];
  const fp = entries
    .map((e) => e.id + ':' + e.version)
    .sort()
    .join('|');
  if (prev?.fingerprint === fp) return state;
  const revision = (prev?.revision || 0) + 1,
    changes = prev ? 'มีการแก้ไขข้อมูลจุดตรวจ' : '';
  return {
    ...state,
    reports: [
      ...state.reports,
      {
        id: uuid(),
        roundId,
        fingerprint: fp,
        revision,
        text: standardReport(round, entries, revision, changes),
        source: 'standard',
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        changes,
        facts: structuredClone(factsFor(round, entries)),
      },
    ],
  };
}
