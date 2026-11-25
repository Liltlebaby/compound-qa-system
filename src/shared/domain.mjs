export const FACTORIES = ['AJ2', 'AJ2B'];
export const SHIFTS = ['กะเช้า', 'กะดึก'];
export const FACTORY_SHIFTS = {
  AJ2: [
    { name: 'กะเช้า', start: '08:00', end: '19:00' },
    { name: 'กะดึก', start: '21:00', end: '08:00' },
  ],
  AJ2B: [{ name: 'กะเช้า', start: '08:00', end: '19:00' }],
};
export const STATIONS = [
  { id: 'oven', name: 'เตาอบ', description: 'Burner · Biscuit · อุณหภูมิยาง', icon: 'flame' },
  { id: 'quality', name: 'คุณภาพ', description: 'ผลตรวจ PO / PRI / MV', icon: 'flask' },
  { id: 'production', name: 'ผลผลิต', description: 'ผลผลิต PB และยางเสีย', icon: 'chart' },
  { id: 'crates', name: 'หอโรย', description: 'จำนวนเก๊ะ A–D · ฝ่ายจักร · ล้าง/ซ่อม', icon: 'box' },
  {
    id: 'packing',
    name: 'PACK / โกดัง',
    description: 'บรรจุ · เข้าโกดัง · defect',
    icon: 'warehouse',
  },
];
export const DEFAULT_CONFIG = {
  factory: 'AJ2',
  line: 'Line 8',
  shift: 'กะเช้า',
  requiredStations: STATIONS.map((s) => s.id),
  unitConfirmed: true,
  ovenEntryMode: 'measurements-and-settings',
  burnerFields: [
    { label: 'SV · อุณหภูมิที่ตั้ง', unit: '°C' },
    { label: 'PV · อุณหภูมิจริง', unit: '°C' },
    { label: 'เวลาอบยาง', unit: 'นาที.วินาที', format: 'duration-mmss' },
  ],
  biscuitUnit: 'กก.',
  orders: [
    {
      id: 'mrf-15701',
      customer: 'MRF',
      so: '15701',
      target: 8,
      recipe: [
        { name: 'P1', percent: 50 },
        { name: 'P5', percent: 50 },
      ],
      specs: { po: [32, 42], pri: null, mv: [57, 67] },
      burnerSet: {
        A: [138, 138, 6.15],
        B: [138, 138, 6.15],
        C: [138, 138, 6.15],
        D: [138, 138, 6.15],
      },
    },
  ],
  assignments: {},
  fieldRules: {},
  reviewRules: { requireExplanation: true },
};
export const DEFECTS = [
  ['fail', 'ยาง Fail'],
  ['metal', 'ยางโลหะ'],
  ['ws', 'ยาง WS'],
  ['mold', 'ยางรา'],
  ['sticky', 'ยางเหนียว'],
  ['crate', 'ยางคัดเก๊ะ'],
  ['popri', 'ยางคัด PO/PRI'],
  ['low', 'ยางคุณภาพต่ำ'],
  ['dirty', 'ยางสกปรก'],
];
export function fieldGroups(station, config, order) {
  if (station === 'quality')
    return [
      {
        title: 'ผลตรวจคุณภาพ',
        fields: ['po', 'pri', 'mv'].map((k) => ({
          key: k,
          label: k.toUpperCase(),
          unit: 'ค่าทดสอบ',
          spec: order.specs[k],
          required: true,
        })),
      },
    ];
  if (station === 'production')
    return [
      {
        title: 'ผลผลิตในรอบนี้',
        fields: [{ key: 'pb', label: 'ผลผลิต PB', unit: 'ตัน', required: true }],
      },
      {
        title: 'ยางเสียแยกประเภท',
        fields: DEFECTS.map(([key, label]) => ({
          key,
          label,
          unit: 'ตัน',
          required: true,
          defaultValue: '0',
        })),
      },
    ];
  if (station === 'oven')
    return ['A', 'B', 'C', 'D'].map((b) => ({
      title: 'เตา ' + b,
      fields: [
        ...config.burnerFields.map((f, i) => ({
          key: b + '_burner' + i,
          label:
            config.ovenEntryMode === 'measurements-and-settings'
              ? f.label
              : f.label +
                ' · ตั้ง ' +
                (f.format === 'duration-mmss'
                  ? durationText(order.burnerSet[b][i])
                  : order.burnerSet[b][i]),
          unit: f.unit || 'รอยืนยันหน่วย',
          format: f.format,
          capture:
            config.ovenEntryMode === 'measurements-and-settings' && (i === 0 || i === 2)
              ? 'on-change'
              : 'measured',
          required: config.ovenEntryMode === 'measurements-and-settings' ? i === 1 : true,
        })),
        {
          key: b + '_biscuit',
          label: 'น้ำหนัก Biscuit',
          unit: config.biscuitUnit || 'รอยืนยันหน่วย',
          required: true,
        },
        { key: b + '_temp', label: 'อุณหภูมิก้อนยาง', unit: '°C', required: true },
      ],
    }));
  if (station === 'crates')
    return [
      {
        title: 'ฝ่ายจักร · จำนวน log',
        fields: ['8', '2'].map((l) => ({
          key: 'line' + l,
          label: 'Line ' + l,
          unit: 'เก๊ะ',
          integer: true,
          required: true,
        })),
      },
      ...['A', 'B', 'C', 'D'].map((b) => ({
        title: 'เตา ' + b + ' · จำนวน ณ จุดตรวจ',
        fields: [
          ['in', 'เข้าเตา'],
          ['after', 'หลังเตา'],
          ['out', 'ออกหน้าเตา'],
        ].map(([k, label]) => ({
          key: b + '_' + k,
          label,
          unit: 'เก๊ะ',
          integer: true,
          required: true,
        })),
      })),
      {
        title: 'งานล้างและซ่อมในรอบ 30 นาที',
        fields: [
          { key: 'wash', label: 'ล้างเก๊ะ / ตะแกรง', unit: 'เก๊ะ', integer: true, required: true },
          {
            key: 'repair',
            label: 'ซ่อมเก๊ะ / ตะแกรง',
            unit: 'เก๊ะ',
            integer: true,
            required: true,
          },
        ],
      },
    ];
  if (station === 'packing')
    return [
      {
        title: 'PACK ในรอบนี้',
        fields: [
          ['packTotal', 'จำนวนที่ PACK'],
          ['packStr', 'STR'],
          ['packPb', 'PB'],
        ].map(([key, label]) => ({
          key,
          label,
          unit: 'ลัง',
          integer: true,
          required: true,
          defaultValue: '0',
        })),
      },
      {
        title: 'ยางเข้าโกดัง',
        fields: [
          ['warehouseStr', 'STR เข้าโกดัง'],
          ['warehousePb', 'PB เข้าโกดัง'],
        ].map(([key, label]) => ({
          key,
          label,
          unit: 'ลัง',
          integer: true,
          required: true,
          defaultValue: '0',
        })),
      },
      {
        title: 'defect ในรอบนี้',
        fields: [
          ['steam', 'ไอน้ำ'],
          ['defectWs', 'ยาง WS'],
          ['defectMold', 'ยางรา'],
          ['ct', 'CT'],
          ['defectStr', 'รวม STR'],
          ['defectPb', 'รวม PB'],
        ].map(([key, label]) => ({
          key,
          label,
          unit: 'ลัง',
          integer: true,
          required: true,
          defaultValue: '0',
        })),
      },
    ];
  return [];
}
export function fieldsFor(station, config, order) {
  return fieldGroups(station, config, order)
    .flatMap((g) => g.fields)
    .map((f) => ({
      ...f,
      ...config.fieldRules?.[station]?.[f.key],
      limit:
        station === 'quality'
          ? f.spec
            ? { min: f.spec[0], max: f.spec[1] }
            : {}
          : order.limits?.[station]?.[f.key] || {},
      requiresExplanation: config.reviewRules?.requireExplanation !== false,
      ...(f.capture === 'on-change' ? { required: false } : {}),
    }));
}
export function asNumber(v) {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  if (
    typeof v === 'string' &&
    (!v.trim() || !/^[-]?(?:[0-9]+[.]?[0-9]*|[.][0-9]+)$/.test(v.trim()))
  )
    return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export function validatePayload(station, data, config, order) {
  const errors = [];
  if (
    data.closedOvens !== undefined &&
    (station !== 'oven' ||
      !Array.isArray(data.closedOvens) ||
      data.closedOvens.some((b) => !OVENS.includes(b)) ||
      new Set(data.closedOvens).size !== data.closedOvens.length)
  )
    errors.push('สถานะเตาปิดไม่ถูกต้อง เลือกได้เฉพาะเตา A–D');
  for (const f of fieldsFor(station, config, order)) {
    const v = data.values?.[f.key],
      missing = isMissingNumber(v),
      reason = data.fieldExplanations?.[f.key];
    if (reason !== undefined && (typeof reason !== 'string' || reason.length > 500))
      errors.push(f.label + ': คำอธิบายต้องเป็นข้อความไม่เกิน 500 ตัวอักษร');
    if (closedOvenMeasurement(f, data)) {
      if (!missing) errors.push(f.label + ': เตาปิดต้องไม่มีค่าตรวจจริงในรอบนี้');
      continue;
    }
    if (missing) {
      if (f.required && !fieldComplete(f, v, data))
        errors.push(
          f.label +
            (f.requiresExplanation
              ? ': กรุณากรอกตัวเลข หรือระบุคำอธิบายเมื่อไม่มีตัวเลข'
              : ': กรุณากรอก 0 หรือเลือกไม่เกี่ยวข้อง'),
        );
      continue;
    }
    if (f.format === 'duration-mmss') {
      if (durationSeconds(v) === null)
        errors.push(f.label + ': กรอกแบบนาที.วินาที เช่น 6.15 = 6 นาที 15 วินาที (วินาที 00–59)');
      continue;
    }
    const n = asNumber(v);
    if (n === null || n < 0 || (f.integer && !Number.isInteger(n)))
      errors.push(
        f.label + ': ต้องเป็น' + (f.integer ? 'จำนวนเต็ม' : 'ตัวเลข') + 'ตั้งแต่ 0 ขึ้นไป',
      );
  }
  if (station === 'oven' && config.ovenEntryMode === 'measurements-and-settings')
    errors.push(...validateOvenChanges(data.ovenChanges));
  if (station === 'packing')
    for (const k of [
      'packCustomer',
      'packSo',
      'warehouseCustomer',
      'warehouseSo',
      'defectCustomer',
      'defectSo',
    ])
      if (!data[k]?.trim()) errors.push('กรุณาระบุลูกค้าและ SO ของ PACK / โกดัง / defect ให้ครบ');
  if (station === 'crates' && asNumber(data.values?.repair) > 0 && !data.repairNo?.trim())
    errors.push('กรุณาระบุหมายเลขเก๊ะที่ซ่อม');
  if (String(data.notes || '').length > 1000) errors.push('หมายเหตุต้องไม่เกิน 1,000 ตัวอักษร');
  return errors;
}
export function observations(station, data, order, config) {
  const result = config
      ? reviewIssues(station, data, config, order)
          .filter((i) => i.kind !== 'missing' && i.kind !== 'packing')
          .map((i) => i.message)
      : [],
    v = data?.values || {};
  if (station === 'quality' && !config)
    for (const key of ['po', 'pri', 'mv']) {
      const n = asNumber(v[key]),
        spec = order.specs[key];
      if (n !== null && spec && (n < spec[0] || n > spec[1]))
        result.push(key.toUpperCase() + ' ' + n + ' นอกสเปก ' + spec[0] + '–' + spec[1]);
    }
  if (station === 'packing') {
    const [total, str, pb] = [v.packTotal, v.packStr, v.packPb].map(asNumber);
    if (total !== null && str !== null && pb !== null && total !== str + pb)
      result.push(
        'จำนวน PACK ' + total + ' ลัง แต่ STR ' + str + ' + PB ' + pb + ' = ' + (str + pb) + ' ลัง',
      );
  }
  return result;
}
export function percent(actual, target) {
  const n = asNumber(actual),
    t = asNumber(target);
  return n !== null && t !== null && t > 0 ? Math.round((n / t) * 10000) / 100 : null;
}
export function readiness(round, submissions) {
  const missing = [];
  for (const order of round.snapshot.orders)
    for (const station of round.snapshot.requiredStations)
      if (
        !submissions.some(
          (s) => s.roundId === round.id && s.orderId === order.id && s.stationId === station,
        )
      )
        missing.push({ orderId: order.id, stationId: station });
  return {
    complete: missing.length === 0,
    missing,
    total: round.snapshot.orders.length * round.snapshot.requiredStations.length,
  };
}
export function bangkokDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function currentStart(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(now)
    .split(':');
  return p[0] + ':' + (Number(p[1]) < 30 ? '00' : '30');
}
export function roundEnd(date, start) {
  const end = new Date(date + 'T' + start + ':00+07:00');
  end.setTime(end.getTime() + 1800000);
  return {
    end: new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(end),
    endAt: end.toISOString(),
  };
}
export function displayDate(date) {
  return new Date(date + 'T12:00:00+07:00').toLocaleDateString('th-TH-u-ca-gregory', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
  });
}
export function numberText(n, digits = 2) {
  return n === null || n === undefined ? '—' : Number(n).toFixed(digits);
}
export function factsFor(round, submissions) {
  return round.snapshot.orders.map((order) => {
    const entries = Object.fromEntries(
      submissions
        .filter((s) => s.roundId === round.id && s.orderId === order.id)
        .map((s) => [s.stationId, s]),
    );
    const actual = asNumber(entries.production?.payload.values.pb);
    return {
      order,
      actual,
      percentage: percent(actual, order.target),
      entries,
      checks: Object.fromEntries(
        Object.entries(entries).map(([s, e]) => [
          s,
          submissionCheck(s, e.payload, round.snapshot, order),
        ]),
      ),
      observations: Object.entries(entries).flatMap(([s, e]) =>
        observations(s, e.payload, order, round.snapshot),
      ),
    };
  });
}
export function formatValue(value, unit = '') {
  return value === 'NA'
    ? 'ไม่เกี่ยวข้อง'
    : value === undefined || value === null || value === ''
      ? 'ยังไม่กรอก'
      : String(value) + (unit ? ' ' + unit : '');
}
export function standardReport(round, submissions, revision = 1, changes = '') {
  const lines = [
    'COMPOUND · ' +
      (round.factory || round.snapshot.factory || 'AJ2') +
      ' · ' +
      displayDate(round.date) +
      ' · ' +
      round.shift,
    round.line + ' · รอบ ' + round.start + '–' + round.end + ' · ฉบับ ' + revision,
  ];
  if (changes) lines.push('ฉบับแก้ไข: ' + changes);
  for (const fact of factsFor(round, submissions)) {
    const { order, entries, actual, percentage } = fact;
    lines.push(
      '',
      order.customer + ' / ' + order.so,
      'สูตร ' + order.recipe.map((r) => r.name + ' ' + r.percent + '%').join(' + '),
    );
    lines.push(
      'ผลผลิต PB ' +
        (actual === null
          ? formatValue(entries.production?.payload.values.pb)
          : numberText(actual) + ' ตัน') +
        ' / เป้า ' +
        numberText(order.target) +
        ' ตัน' +
        (percentage === null ? '' : ' = ' + numberText(percentage) + '%'),
    );
    if (actual !== null && order.target > 0)
      lines.push(
        (actual < order.target ? 'ต่ำกว่า' : actual > order.target ? 'สูงกว่า' : 'เท่ากับ') +
          'เป้ารอบนี้' +
          (actual === order.target
            ? ''
            : ' ' + numberText(Math.abs(order.target - actual)) + ' ตัน'),
      );
    if (entries.quality)
      for (const key of ['po', 'pri', 'mv']) {
        const val = entries.quality.payload.values[key],
          n = asNumber(val),
          spec = order.specs[key];
        lines.push(
          key.toUpperCase() +
            ' ' +
            formatValue(val) +
            ' · ' +
            (!spec
              ? 'ไม่มีเกณฑ์สเปก'
              : n === null
                ? 'ไม่ตัดสินผล'
                : n >= spec[0] && n <= spec[1]
                  ? 'อยู่ในสเปก'
                  : 'นอกสเปก') +
            (spec ? ' (' + spec.join('–') + ')' : ''),
        );
      }
    for (const [station, e] of Object.entries(entries)) {
      if (station === 'oven' || station === 'crates') {
        lines.push(
          STATIONS.find((s) => s.id === station).name +
            (station === 'crates' ? ' (จำนวน ณ จุดตรวจ)' : ''),
        );
        for (const g of fieldGroups(station, round.snapshot, order)) {
          if (station === 'oven' && isOvenClosed(e.payload, g.fields[0].key.split('_')[0])) {
            lines.push(g.title + ': เตาปิด');
            continue;
          }
          lines.push(
            g.title +
              ': ' +
              g.fields
                .map((f) => f.label + ' ' + formatFieldValue(f, e.payload.values[f.key]))
                .join(' · '),
          );
        }
        if (station === 'crates' && e.payload.repairNo)
          lines.push('หมายเลขเก๊ะซ่อม ' + e.payload.repairNo);
      }
      if (station === 'production')
        lines.push(
          'ยางเสีย: ' +
            DEFECTS.map(([k, label]) => label + ' ' + formatValue(e.payload.values[k], 'ตัน')).join(
              ' · ',
            ),
        );
      if (station === 'packing') {
        const p = e.payload;
        lines.push(
          'PACK ' +
            p.packCustomer +
            '/' +
            p.packSo +
            ': ทั้งหมด ' +
            formatValue(p.values.packTotal, 'ลัง') +
            ' · STR ' +
            formatValue(p.values.packStr) +
            ' · PB ' +
            formatValue(p.values.packPb),
          'เข้าโกดัง ' +
            p.warehouseCustomer +
            '/' +
            p.warehouseSo +
            ': STR ' +
            formatValue(p.values.warehouseStr) +
            ' · PB ' +
            formatValue(p.values.warehousePb) +
            ' ลัง',
          'defect ' +
            p.defectCustomer +
            '/' +
            p.defectSo +
            ': ไอน้ำ ' +
            formatValue(p.values.steam) +
            ' · WS ' +
            formatValue(p.values.defectWs) +
            ' · รา ' +
            formatValue(p.values.defectMold) +
            ' · CT ' +
            formatValue(p.values.ct) +
            ' · STR ' +
            formatValue(p.values.defectStr) +
            ' · PB ' +
            formatValue(p.values.defectPb) +
            ' ลัง',
        );
      }
      if (station === 'oven') lines.push(...ovenSettingsChangeText(e.payload));
      for (const issue of reviewIssues(station, e.payload, round.snapshot, order).filter(
        (i) => i.kind === 'missing',
      ))
        lines.push('ข้อมูลไม่มีตัวเลข: ' + issue.message);
      if (e.payload.notes?.trim())
        lines.push(
          'หมายเหตุ ' + STATIONS.find((s) => s.id === station).name + ': ' + e.payload.notes.trim(),
        );
      if (e.payload.confirmation?.trim())
        lines.push('ยืนยันข้อสังเกต: ' + e.payload.confirmation.trim());
    }
    for (const warning of fact.observations) lines.push('ข้อสังเกต: ' + warning);
  }
  return lines.join('\n');
}
export function validateConfig(config) {
  const errors = [...validateLimits(config)];
  if (!FACTORIES.includes(config.factory)) errors.push('โรงงานไม่ถูกต้อง');
  if (!FACTORY_SHIFTS[config.factory]?.some((s) => s.name === config.shift))
    errors.push('กะไม่ถูกต้อง');
  if (!config.line?.trim()) errors.push('กรุณาระบุไลน์');
  if (!Array.isArray(config.orders) || !config.orders.length)
    return ['ต้องมีอย่างน้อยหนึ่งลูกค้า/SO'];
  if (
    !config.requiredStations?.length ||
    config.requiredStations.some((s) => !STATIONS.some((x) => x.id === s))
  )
    errors.push('เลือกจุดตรวจอย่างน้อยหนึ่งจุด');
  const schedule = scheduleFor(config),
    timePattern = /^(?:[01]\d|2[0-3]):(?:00|30)$/;
  if (
    typeof schedule.enabled !== 'boolean' ||
    !timePattern.test(schedule.start) ||
    !timePattern.test(schedule.end) ||
    schedule.start === schedule.end
  )
    errors.push('เวลาเริ่ม–เลิกกะต้องต่างกัน และเป็นนาที 00 หรือ 30');
  const ids = new Set(),
    pairs = new Set();
  for (const o of config.orders) {
    if (!o.id || ids.has(o.id)) errors.push('รหัสงานซ้ำ');
    ids.add(o.id);
    const pair = o.customer?.trim() + '/' + o.so?.trim();
    if (!o.customer?.trim() || !o.so?.trim() || pairs.has(pair))
      errors.push('ลูกค้า/SO ต้องระบุและไม่ซ้ำกัน');
    pairs.add(pair);
    if (!Number.isFinite(o.target) || o.target < 0)
      errors.push('เป้าต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
    if (
      !o.recipe?.length ||
      o.recipe.some((r) => !r.name?.trim() || !Number.isFinite(r.percent) || r.percent < 0) ||
      Math.abs(o.recipe.reduce((sum, r) => sum + r.percent, 0) - 100) > 0.001
    )
      errors.push('สูตรผสมต้องรวมเป็น 100%');
    for (const k of ['po', 'pri', 'mv'])
      if (
        o.specs?.[k] !== null &&
        (!Array.isArray(o.specs?.[k]) ||
          o.specs[k].length !== 2 ||
          o.specs[k].some((v) => !Number.isFinite(v) || v < 0) ||
          o.specs[k][0] > o.specs[k][1])
      )
        errors.push('สเปก ' + k + ' ไม่ถูกต้อง');
    for (const b of ['A', 'B', 'C', 'D'])
      if (
        !Array.isArray(o.burnerSet?.[b]) ||
        o.burnerSet[b].length !== 3 ||
        o.burnerSet[b].some((v, i) =>
          config.burnerFields?.[i]?.format === 'duration-mmss'
            ? durationSeconds(v) === null
            : !Number.isFinite(v) || v < 0,
        )
      )
        errors.push('ค่าตั้งเตา ' + b + ' ไม่ถูกต้อง');
  }
  if (
    config.unitConfirmed &&
    (config.burnerFields?.length !== 3 ||
      config.burnerFields.some((f) => !f.label?.trim() || !f.unit?.trim()) ||
      !config.biscuitUnit?.trim())
  )
    errors.push('กรุณายืนยันชื่อและหน่วย Burner ทั้ง 3 ค่า และหน่วยน้ำหนัก Biscuit');
  return errors;
}

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
  return (
    h.slice(0, 8) +
    '-' +
    h.slice(8, 12) +
    '-' +
    h.slice(12, 16) +
    '-' +
    h.slice(16, 20) +
    '-' +
    h.slice(20)
  );
}

// All schedule calculations use Bangkok time, independent of the server timezone.
export function scheduleFor(config) {
  const shift = FACTORY_SHIFTS[config.factory]?.find((s) => s.name === config.shift);
  return { enabled: true, start: shift?.start || '', end: shift?.end || '', ...config.schedule };
}
export function shiftDate(date, days) {
  return bangkokDate(new Date(Date.parse(date + 'T12:00:00+07:00') + days * 86400000));
}
export function currentSlot(config, at = new Date()) {
  const schedule = scheduleFor(config),
    start = currentStart(at),
    calendarDate = bangkokDate(at);
  if (!schedule.enabled || !schedule.start || !schedule.end || schedule.start === schedule.end)
    return null;
  const overnight = schedule.start > schedule.end;
  if (
    overnight
      ? start < schedule.start && start >= schedule.end
      : start < schedule.start || start >= schedule.end
  )
    return null;
  return {
    date: overnight && start < schedule.end ? shiftDate(calendarDate, -1) : calendarDate,
    start,
  };
}
export function activeShift(factory, at = new Date(), schedules = FACTORY_SHIFTS[factory]) {
  // Pausing round creation doesn't change which shift is on duty.
  const matches = (schedules || []).flatMap((s) => {
    const slot = currentSlot(
      { factory, shift: s.name, schedule: { start: s.start, end: s.end, enabled: true } },
      at,
    );
    return slot
      ? [{ shift: s.name, date: slot.date, startedAt: slot.date + 'T' + s.start + ':00+07:00' }]
      : [];
  });
  matches.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  return matches.length ? { shift: matches[0].shift, date: matches[0].date } : null;
}
export function roundTiming(config, date, start) {
  const s = scheduleFor(config);
  const calendarDate = s.start > s.end && start < s.end ? shiftDate(date, 1) : date;
  return roundEnd(calendarDate, start);
}
export function isCurrentRound(round, config, at = new Date()) {
  const slot = currentSlot(config, at);
  return Boolean(
    slot && round.date === slot.date && round.start === slot.start && round.line === config.line,
  );
}
export function autoRoundIssue(config) {
  if (!scheduleFor(config).enabled) return 'ปิดการเปิดรอบอัตโนมัติ';
  if (validateConfig(config).length) return 'กรุณาตรวจสอบแผนผลิตและเวลากะในตั้งค่า';
  if (config.requiredStations.includes('oven') && !config.unitConfirmed)
    return 'รอยืนยันชื่อและหน่วย Burner / Biscuit ในตั้งค่า';
  return '';
}
export function ensureDemoRound(state, at = new Date()) {
  const slot = currentSlot(state.config, at);
  if (!slot || validateConfig(state.config).length) return state;
  if (state.rounds.some((r) => isCurrentRound(r, state.config, at))) return state;
  const timing = roundTiming(state.config, slot.date, slot.start),
    id =
      'auto-' +
      state.config.factory +
      '-' +
      state.config.shift +
      '-' +
      state.config.line +
      '-' +
      slot.date +
      '-' +
      slot.start;
  return {
    ...state,
    rounds: [
      {
        id,
        ...slot,
        ...timing,
        factory: state.config.factory,
        shift: state.config.shift,
        line: state.config.line,
        snapshot: structuredClone(state.config),
        createdAt: at.toISOString(),
      },
      ...state.rounds,
    ],
  };
}

export function validProductionDate(date) {
  return (
    typeof date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date + 'T12:00:00+07:00')) &&
    bangkokDate(new Date(date + 'T12:00:00+07:00')) === date
  );
}
export function productionDate(config, at = new Date()) {
  return (
    currentSlot({ ...config, schedule: { ...scheduleFor(config), enabled: true } }, at)?.date ||
    bangkokDate(at)
  );
}
export function roundsOnDate(rounds, date) {
  return rounds
    .filter((r) => r.date === date)
    .sort((a, b) => b.endAt.localeCompare(a.endAt) || b.id.localeCompare(a.id));
}

export function stationQrScope(search) {
  const q = new URLSearchParams(search),
    stationId = q.get('station'),
    factory = q.get('factory'),
    shift = q.get('shift'),
    line = q.get('line');
  if (
    !STATIONS.some((s) => s.id === stationId) ||
    !FACTORIES.includes(factory) ||
    !FACTORY_SHIFTS[factory]?.some((s) => s.name === shift) ||
    !line?.trim()
  )
    throw new Error(
      'QR นี้ไม่มีข้อมูลโรง กะ หรือจุดตรวจที่ถูกต้อง กรุณาใช้ QR ชุดใหม่ที่ระบุโรงและกะ',
    );
  return { stationId, factory, shift, line };
}
export function stationQrUrl(base, config, stationId, demo) {
  const url = new URL('/', base);
  url.search = new URLSearchParams({
    station: stationId,
    factory: config.factory,
    shift: config.shift,
    line: config.line,
    ...(demo ? { demo: '1' } : { mode: 'live' }),
  }).toString();
  stationQrScope(url.search);
  return url.href;
}

export function shiftStarts(config) {
  const schedule = scheduleFor(config),
    minute = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  if (
    !/^(?:[01]\d|2[0-3]):(?:00|30)$/.test(schedule.start) ||
    !/^(?:[01]\d|2[0-3]):(?:00|30)$/.test(schedule.end) ||
    schedule.start === schedule.end
  )
    return [];
  const start = minute(schedule.start),
    duration = (minute(schedule.end) - start + 1440) % 1440;
  return Array.from({ length: duration / 30 }, (_, i) => {
    const m = (start + i * 30) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  });
}
export function backfillSlotIssue(config, date, start, at = new Date()) {
  if (!validProductionDate(date) || !shiftStarts(config).includes(start))
    return 'กรุณาเลือกวันที่และรอบเวลาภายในกะนี้';
  if (Date.parse(roundTiming(config, date, start).endAt) > at.getTime())
    return 'เลือกได้เฉพาะรอบที่จบแล้ว ไม่สามารถกรอกล่วงหน้าได้';
  return '';
}
export function latestCompletedSlot(config, at = new Date()) {
  const candidates = [];
  for (const date of [bangkokDate(at), shiftDate(bangkokDate(at), -1)])
    for (const start of shiftStarts(config))
      if (!backfillSlotIssue(config, date, start, at))
        candidates.push({ date, start, ...roundTiming(config, date, start) });
  return candidates.sort((a, b) => b.endAt.localeCompare(a.endAt))[0] || null;
}

export function durationSeconds(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) return null;
  let text = String(value).trim();
  if (typeof value === 'number' && text.includes('.')) {
    const [m, s] = text.split('.');
    text = m + '.' + s.padEnd(2, '0');
  }
  const match = /^(\d{1,6})(?:[.:](\d{2}))?$/.exec(text);
  if (!match) return null;
  const minutes = Number(match[1]),
    seconds = Number(match[2] || 0);
  return seconds < 60 ? minutes * 60 + seconds : null;
}
export function durationText(value) {
  const seconds = durationSeconds(value);
  return seconds === null
    ? formatValue(value)
    : Math.floor(seconds / 60) + ' นาที ' + (seconds % 60) + ' วินาที';
}
export function formatFieldValue(field, value) {
  return field.format === 'duration-mmss' ? durationText(value) : formatValue(value, field.unit);
}
export function knownOvenTime(config) {
  let changed = false;
  const burnerFields = config.burnerFields?.map((f, i) => {
    const generic = f.label === 'ค่า Burner ' + (i + 1) && !f.unit;
    if (i < 2 && generic) {
      changed = true;
      return { ...f, label: i === 0 ? 'SV · อุณหภูมิที่ตั้ง' : 'PV · อุณหภูมิจริง', unit: '°C' };
    }
    if (i === 2 && generic) {
      changed = true;
      return { ...f, label: 'เวลาอบยาง', unit: 'นาที.วินาที', format: 'duration-mmss' };
    }
    return f;
  });
  const known =
    burnerFields?.[0]?.label.startsWith('SV') &&
    burnerFields?.[1]?.label.startsWith('PV') &&
    burnerFields?.[2]?.format === 'duration-mmss';
  if (known && (config.ovenEntryMode !== 'measurements-and-settings' || !config.biscuitUnit)) {
    changed = true;
  }
  return changed
    ? {
        ...config,
        burnerFields,
        ovenEntryMode: known ? 'measurements-and-settings' : config.ovenEntryMode,
        biscuitUnit: known && !config.biscuitUnit ? 'กก.' : config.biscuitUnit,
        unitConfirmed: known ? true : config.unitConfirmed,
      }
    : config;
}
export function upgradeDemoOvenTime(state) {
  if (!state?.demo) return state;
  const config = knownOvenTime(state.config),
    rounds = state.rounds.map((r) => {
      const snapshot = knownOvenTime(r.snapshot);
      return snapshot === r.snapshot ? r : { ...r, snapshot };
    });
  return config !== state.config || rounds.some((r, i) => r !== state.rounds[i])
    ? { ...state, config, rounds }
    : state;
}

export const OVENS = ['A', 'B', 'C', 'D'];
export function ovenSettingDefaults(order) {
  return Object.fromEntries(
    OVENS.map((b) => [
      b,
      { sv: String(order.burnerSet[b][0]), time: durationCode(order.burnerSet[b][2]) },
    ]),
  );
}
export function durationCode(value) {
  const n = durationSeconds(value);
  return n === null ? String(value) : Math.floor(n / 60) + '.' + String(n % 60).padStart(2, '0');
}
export function validateOvenChanges(changes) {
  if (changes === undefined) return [];
  if (!changes || typeof changes !== 'object' || Array.isArray(changes))
    return ['รายการปรับค่าตั้งเตาไม่ถูกต้อง'];
  const errors = [];
  for (const [b, change] of Object.entries(changes)) {
    if (!OVENS.includes(b) || !change || typeof change !== 'object' || Array.isArray(change)) {
      errors.push('เตาที่ปรับค่าไม่ถูกต้อง');
      continue;
    }
    for (const [key, value] of Object.entries(change)) {
      if (!['sv', 'time'].includes(key)) errors.push('ปรับได้เฉพาะ SV และเวลาอบยาง');
      else if (key === 'sv' && (asNumber(value) === null || asNumber(value) < 0))
        errors.push('SV เตา ' + b + ' ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
      else if (key === 'time' && durationSeconds(value) === null)
        errors.push('เวลาอบยางเตา ' + b + ': กรอกนาที.วินาที โดยวินาที 00–59');
    }
  }
  return errors;
}
export function resolveOvenSettings(round, order, events = []) {
  const result = ovenSettingDefaults(order),
    epoch = order.ovenSettingsEpoch || 'initial',
    at = Date.parse(round.endAt) - 1800000;
  for (const e of [...events].sort(
    (a, b) => a.effectiveAt.localeCompare(b.effectiveAt) || a.createdAt.localeCompare(b.createdAt),
  )) {
    if (
      e.roundId === round.id ||
      e.factory !== round.factory ||
      e.shift !== round.shift ||
      e.line !== round.line ||
      e.orderId !== order.id ||
      e.epoch !== epoch ||
      Date.parse(e.effectiveAt) > at
    )
      continue;
    const changes = typeof e.changes === 'string' ? JSON.parse(e.changes) : e.changes;
    for (const b of OVENS) if (changes[b]) Object.assign(result[b], changes[b]);
  }
  return result;
}
export function prepareOvenPayload(payload, settings) {
  const changes = {},
    values = { ...payload.values };
  for (const b of OVENS) {
    const proposed = payload.ovenChanges?.[b] || {},
      next = { ...settings[b] };
    for (const key of ['sv', 'time'])
      if (proposed[key] !== undefined) {
        const value = key === 'sv' ? String(asNumber(proposed[key])) : durationCode(proposed[key]);
        if (value !== settings[b][key]) {
          changes[b] = { ...changes[b], [key]: value };
          next[key] = value;
        }
      }
    values[b + '_burner0'] = next.sv;
    values[b + '_burner2'] = next.time;
  }
  return {
    ...payload,
    values,
    ovenChanges: changes,
    ovenSettingsVersion: JSON.stringify(settings),
    ovenSettingsBefore: structuredClone(settings),
  };
}
export function demoOvenEvents(state) {
  return state.submissions
    .filter((s) => s.stationId === 'oven' && Object.keys(s.payload.ovenChanges || {}).length)
    .map((s) => {
      const r = state.rounds.find((r) => r.id === s.roundId),
        o = r.snapshot.orders.find((o) => o.id === s.orderId);
      return {
        roundId: r.id,
        factory: r.factory,
        shift: r.shift,
        line: r.line,
        orderId: o.id,
        epoch: o.ovenSettingsEpoch || 'initial',
        effectiveAt: new Date(Date.parse(r.endAt) - 1800000).toISOString(),
        createdAt: s.submittedAt,
        changes: s.payload.ovenChanges,
      };
    });
}

export function withOvenEpochs(previous, config, newId = uuid) {
  return {
    ...config,
    orders: config.orders.map((o) => {
      const old = previous.orders.find((x) => x.id === o.id),
        same =
          old &&
          old.customer === o.customer &&
          old.so === o.so &&
          previous.line === config.line &&
          OVENS.every(
            (b) =>
              asNumber(old.burnerSet[b][0]) === asNumber(o.burnerSet[b][0]) &&
              durationSeconds(old.burnerSet[b][2]) === durationSeconds(o.burnerSet[b][2]),
          );
      return { ...o, ovenSettingsEpoch: same ? old.ovenSettingsEpoch || 'initial' : newId() };
    }),
  };
}
export function ovenSettingsChangeText(payload) {
  return Object.entries(payload.ovenChanges || {}).map(
    ([b, change]) =>
      'ปรับค่าตั้งเตา ' +
      b +
      ': ' +
      Object.entries(change)
        .map(([key, value]) =>
          key === 'sv'
            ? 'SV ' + formatValue(payload.ovenSettingsBefore?.[b]?.sv) + ' → ' + value + ' °C'
            : 'เวลาอบ ' +
              durationText(payload.ovenSettingsBefore?.[b]?.time) +
              ' → ' +
              durationText(value),
        )
        .join(' · '),
  );
}

export const TOWER_STEPS = [
  { id: 'machine', name: 'ฝ่ายจักร' },
  ...['A', 'B', 'C', 'D'].map((id) => ({ id, name: 'จุด ' + id })),
  { id: 'service', name: 'ล้าง/ซ่อม' },
];
export function towerProgress(payload, config, order) {
  const fields = fieldsFor('crates', config, order);
  return fieldGroups('crates', config, order).map((group, index) => {
    const required = group.fields
        .map((f) => fields.find((x) => x.key === f.key))
        .filter((f) => f.required),
      extra = index === 5 ? ['repair'].filter((k) => asNumber(payload.values?.[k]) > 0) : [];
    let filled = required.filter((f) => fieldComplete(f, payload.values?.[f.key], payload)).length;
    filled += extra.filter((k) =>
      String(payload[k === 'wash' ? 'washNo' : 'repairNo'] || '').trim(),
    ).length;
    return {
      id: TOWER_STEPS[index].id,
      total: required.length + extra.length,
      filled,
      complete: filled === required.length + extra.length,
    };
  });
}

export function isMissingNumber(value) {
  return (
    value === 'NA' ||
    value === undefined ||
    value === null ||
    (typeof value === 'string' && !value.trim())
  );
}
export function isOvenClosed(payload, burner) {
  return (
    OVENS.includes(burner) &&
    Array.isArray(payload?.closedOvens) &&
    payload.closedOvens.includes(burner)
  );
}
export function closedOvenMeasurement(field, payload) {
  const match = /^([A-D])_(burner1|biscuit|temp)$/.exec(field?.key || '');
  return Boolean(match && isOvenClosed(payload, match[1]));
}
export function fieldComplete(field, value, payload) {
  if (closedOvenMeasurement(field, payload)) return isMissingNumber(value);
  if (isMissingNumber(value)) {
    if (!field.required) return true;
    if (field.requiresExplanation)
      return (
        typeof payload?.fieldExplanations?.[field.key] === 'string' &&
        !!payload.fieldExplanations[field.key].trim()
      );
    return value === 'NA';
  }
  return field.format === 'duration-mmss'
    ? durationSeconds(value) !== null
    : asNumber(value) !== null &&
        asNumber(value) >= 0 &&
        (!field.integer || Number.isInteger(asNumber(value)));
}
export function limitText(field) {
  const format = (v) => formatFieldValue(field, v);
  return [
    ['min', 'Min'],
    ['max', 'Max'],
  ]
    .filter(
      ([k]) => field.limit?.[k] !== undefined && field.limit[k] !== null && field.limit[k] !== '',
    )
    .map(([k, label]) => label + ' ' + format(field.limit[k]))
    .join(' · ');
}
export function fieldRangeIssue(field, value) {
  if (isMissingNumber(value)) return null;
  const convert = (v) => (field.format === 'duration-mmss' ? durationSeconds(v) : asNumber(v)),
    n = convert(value),
    min = convert(field.limit?.min),
    max = convert(field.limit?.max);
  if (n === null || n < 0 || (field.integer && !Number.isInteger(n))) return null;
  if ((min !== null && n < min) || (max !== null && n > max))
    return {
      kind: 'range',
      fieldKey: field.key,
      label: field.label,
      severity: 'critical',
      value,
      limit: field.limit,
      unit: field.unit,
      message:
        field.label +
        ' ' +
        formatFieldValue(field, value) +
        ' ' +
        (field.spec ? 'นอกสเปก' : 'นอกเกณฑ์') +
        ' (' +
        limitText(field) +
        ')',
    };
  return null;
}
export function reviewIssues(station, payload, config, order) {
  const issues = [];
  for (const field of fieldsFor(station, config, order)) {
    if (station === 'oven' && isOvenClosed(payload, field.key.split('_')[0])) continue;
    const value = payload?.values?.[field.key],
      reason = payload?.fieldExplanations?.[field.key],
      range = fieldRangeIssue(field, value);
    if (range) issues.push(range);
    if (field.required && field.requiresExplanation && isMissingNumber(value))
      issues.push({
        kind: 'missing',
        fieldKey: field.key,
        label: field.label,
        severity: 'warning',
        value: value ?? '',
        reason: typeof reason === 'string' ? reason.trim() : '',
        message:
          field.label +
          ' ไม่มีตัวเลข' +
          (typeof reason === 'string' && reason.trim()
            ? ' · เหตุผล: ' + reason.trim()
            : ' · ยังไม่มีคำอธิบาย'),
      });
  }
  if (station === 'packing') {
    const [total, str, pb] = ['packTotal', 'packStr', 'packPb'].map((k) =>
      asNumber(payload?.values?.[k]),
    );
    if (total !== null && str !== null && pb !== null && total !== str + pb)
      issues.push({
        kind: 'packing',
        fieldKey: 'packTotal',
        label: 'ยอด PACK',
        severity: 'critical',
        value: total,
        message:
          'จำนวน PACK ' +
          total +
          ' ลัง แต่ STR ' +
          str +
          ' + PB ' +
          pb +
          ' = ' +
          (str + pb) +
          ' ลัง',
      });
  }
  return issues;
}
export function submissionCheck(station, payload, config, order) {
  const required = fieldsFor(station, config, order).filter(
      (f) => f.required && !closedOvenMeasurement(f, payload),
    ),
    missing = required.filter((f) => isMissingNumber(payload.values?.[f.key]));
  return {
    required: required.length,
    numeric: required.filter(
      (f) =>
        !isMissingNumber(payload.values?.[f.key]) &&
        fieldComplete(f, payload.values?.[f.key], payload),
    ).length,
    explained: missing.filter((f) => fieldComplete(f, payload.values?.[f.key], payload)).length,
    issues: reviewIssues(station, payload, config, order),
  };
}
export function validateLimits(config) {
  const errors = [];
  if (
    config.reviewRules?.requireExplanation !== undefined &&
    typeof config.reviewRules.requireExplanation !== 'boolean'
  )
    errors.push('กฎคำอธิบายข้อมูลไม่ครบไม่ถูกต้อง');
  for (const order of config.orders || [])
    for (const [station, limits] of Object.entries(order.limits || {})) {
      if (
        !STATIONS.some((s) => s.id === station) ||
        station === 'quality' ||
        !limits ||
        typeof limits !== 'object' ||
        Array.isArray(limits)
      ) {
        errors.push('ตั้งค่า Min–Max ของจุดตรวจไม่ถูกต้อง');
        continue;
      }
      for (const [key, limit] of Object.entries(limits)) {
        const field = fieldGroups(station, config, order)
          .flatMap((g) => g.fields)
          .find((f) => f.key === key);
        if (!field || !limit || typeof limit !== 'object' || Array.isArray(limit)) {
          errors.push('ช่อง Min–Max ไม่ถูกต้อง: ' + key);
          continue;
        }
        const values = {};
        for (const side of ['min', 'max']) {
          const raw = limit[side];
          if (raw === undefined || raw === null || raw === '') continue;
          const n = field.format === 'duration-mmss' ? durationSeconds(raw) : asNumber(raw);
          if (n === null || n < 0 || (field.integer && !Number.isInteger(n)))
            errors.push(field.label + ': ' + side + ' ต้องเป็นค่าที่ถูกต้องและไม่ติดลบ');
          else values[side] = n;
        }
        if (values.min !== undefined && values.max !== undefined && values.min > values.max)
          errors.push(field.label + ': Min ต้องไม่มากกว่า Max');
      }
    }
  return errors;
}
export function qaAlarmId(round, order, station, issue) {
  return JSON.stringify([round.id, order.id, station, issue.kind, issue.fieldKey]);
}
export function syncDemoAlarms(state, submission) {
  const round = state.rounds.find((r) => r.id === submission.roundId),
    order = round.snapshot.orders.find((o) => o.id === submission.orderId),
    at = submission.submittedAt,
    active = reviewIssues(submission.stationId, submission.payload, round.snapshot, order),
    previous = state.alarms || [],
    ids = new Set(active.map((i) => qaAlarmId(round, order, submission.stationId, i)));
  const alarms = previous.map((a) =>
    a.roundId === round.id &&
    a.orderId === order.id &&
    a.stationId === submission.stationId &&
    !ids.has(a.id) &&
    a.status !== 'resolved'
      ? {
          ...a,
          status: 'resolved',
          resolvedAt: at,
          updatedAt: at,
          resolutionMethod: 'data',
          resolvedBy: submission.operatorId,
          resolvedName: submission.operatorName,
          resolutionNote:
            submission.stationId === 'oven' &&
            isOvenClosed(submission.payload, a.fieldKey?.split('_')[0])
              ? 'เตา ' + a.fieldKey.split('_')[0] + ' ปิดในรอบนี้ จึงไม่ใช้เกณฑ์ค่าตรวจของเตานี้'
              : 'ส่งค่าตรวจใหม่แล้ว ไม่พบข้อผิดปกตินี้ในรอบเดิม',
        }
      : a,
  );
  for (const issue of active) {
    const id = qaAlarmId(round, order, submission.stationId, issue),
      prior = alarms.find((a) => a.id === id),
      changed =
        !prior ||
        (prior.status === 'resolved' && prior.resolutionMethod !== 'manual') ||
        JSON.stringify(prior.details) !== JSON.stringify(issue),
      next = {
        ...prior,
        id,
        roundId: round.id,
        orderId: order.id,
        stationId: submission.stationId,
        fieldKey: issue.fieldKey,
        kind: issue.kind,
        severity: issue.severity,
        message: issue.message,
        details: issue,
        firstSeenAt: prior?.firstSeenAt || at,
        updatedAt: at,
        status: changed ? 'open' : prior.status,
        resolvedAt: changed ? null : prior.resolvedAt,
        ...(changed
          ? {
              resolutionMethod: null,
              resolvedBy: null,
              resolvedName: null,
              resolutionNote: null,
              acknowledgedBy: null,
              acknowledgedName: null,
              acknowledgedAt: null,
              ackNote: null,
            }
          : {}),
      };
    const index = alarms.findIndex((a) => a.id === id);
    if (index < 0) alarms.push(next);
    else alarms[index] = next;
  }
  const events = alarms.flatMap((a) => {
    const prior = previous.find((p) => p.id === a.id);
    if (
      prior &&
      prior.status === a.status &&
      JSON.stringify(prior.details) === JSON.stringify(a.details)
    )
      return [];
    return [
      {
        id: submission.id + ':' + submission.version + ':' + a.id,
        alarmId: a.id,
        at,
        actorId: submission.operatorId,
        actorName: submission.operatorName,
        action: a.status === 'resolved' ? 'resolved' : prior ? 'reopened' : 'opened',
        note:
          a.status === 'resolved' ? 'ส่งค่าตรวจใหม่แล้ว ไม่พบข้อผิดปกตินี้ในรอบเดิม' : a.message,
      },
    ];
  });
  return { ...state, alarms, alarmEvents: [...events, ...(state.alarmEvents || [])] };
}
