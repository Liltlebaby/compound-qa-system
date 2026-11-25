import {
  asNumber,
  numberText,
  formatValue as domainFormatValue,
  displayDate,
  durationText as domainDurationText,
  DEFECTS,
  STATIONS,
  ovenSettingsChangeText,
  isOvenClosed,
} from './domain.mjs';

export function reportValue(value, unit = '') {
  return value === 'NA' ? '-' : domainFormatValue(value, unit);
}
export function reportDuration(value) {
  return value === 'NA' ? '-' : domainDurationText(value);
}
const formatValue = reportValue,
  durationText = reportDuration;

export function qualityResult(value, spec) {
  const n = asNumber(value),
    bad = !!spec && n !== null && (n < spec[0] || n > spec[1]);
  return {
    bad,
    tone: bad ? 'amber' : spec && n !== null ? 'green' : 'neutral',
    label: !spec ? 'ไม่มีเกณฑ์สเปก' : n === null ? 'ไม่ตัดสินผล' : bad ? 'นอกสเปก' : 'อยู่ในสเปก',
    range: spec ? spec.join('–') : null,
  };
}
export function targetResult(fact) {
  const actual = asNumber(fact.actual),
    target = asNumber(fact.order?.target);
  return actual === null || target === null
    ? 'ยังคำนวณเทียบเป้าไม่ได้'
    : actual === target
      ? 'เท่ากับเป้ารอบนี้'
      : (actual < target ? 'ต่ำกว่า' : 'สูงกว่า') +
        'เป้ารอบนี้ ' +
        numberText(Math.abs(actual - target)) +
        ' ตัน';
}
export function allExplicitZero(values) {
  return values.length > 0 && values.every((v) => asNumber(v) === 0);
}
export function reportTimestamp(value) {
  return value
    ? new Date(value).toLocaleString('th-TH-u-ca-gregory', {
        timeZone: 'Asia/Bangkok',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
}
export function reportShareText(round, report) {
  // Use only this revision's stored facts, never today's submissions or edited plan.
  if (!report.facts?.length) return report.text || '';
  const lines = [
    '*COMPOUND · ' + (round.factory || round.snapshot?.factory || 'AJ2') + '*',
    displayDate(round.date) + ' · ' + round.shift + ' · ' + round.line,
    'รอบ ' + round.start + '–' + round.end + ' · ฉบับ ' + report.revision,
    'ข้อมูลครบ: ' + reportTimestamp(report.completedAt),
  ];
  if (report.changes) lines.push('ฉบับแก้ไข: ' + report.changes);
  for (const fact of report.facts) {
    const { order, entries } = fact,
      v = entries.production?.payload.values || {};
    lines.push(
      '',
      '*' + order.customer + ' / ' + order.so + '*',
      'ผลผลิต PB ' + (fact.actual === null ? formatValue(v.pb) : numberText(fact.actual) + ' ตัน'),
      'เป้ารอบนี้ ' + numberText(order.target) + ' ตัน',
      'สำเร็จ ' + (fact.percentage === null ? 'ยังคำนวณไม่ได้' : numberText(fact.percentage) + '%'),
      targetResult(fact),
    );
    if (order.recipe?.length)
      lines.push('สูตร ' + order.recipe.map((r) => r.name + ' ' + r.percent + '%').join(' + '));
    if (fact.observations?.length)
      lines.push('', '*ข้อสังเกต*', ...fact.observations.map((w) => '• ' + w));
    if (entries.quality) {
      lines.push('', '*คุณภาพ*');
      for (const k of ['po', 'pri', 'mv']) {
        const value = entries.quality.payload.values[k],
          q = qualityResult(value, order.specs?.[k]);
        lines.push(
          k.toUpperCase() +
            ' ' +
            formatValue(value) +
            ' — ' +
            q.label +
            (q.range ? ' (' + q.range + ')' : ''),
        );
      }
    }
    if (entries.oven) {
      const p = entries.oven.payload,
        a = p.values;
      lines.push('', '*เตาอบ*');
      for (const b of ['A', 'B', 'C', 'D']) {
        if (isOvenClosed(p, b)) {
          lines.push('เตา ' + b + ' · เตาปิด');
          continue;
        }
        lines.push(
          'เตา ' + b,
          '  SV ' +
            formatValue(a[b + '_burner0'], '°C') +
            ' / PV ' +
            formatValue(a[b + '_burner1'], '°C'),
          '  เวลาอบ ' + durationText(a[b + '_burner2']),
          '  Biscuit ' +
            formatValue(a[b + '_biscuit'], 'กก.') +
            ' / ก้อนยาง ' +
            formatValue(a[b + '_temp'], '°C'),
        );
      }
      lines.push(...ovenSettingsChangeText(p));
    }
    if (entries.crates) {
      const p = entries.crates.payload,
        a = p.values;
      lines.push(
        '',
        '*หอโรย · จำนวน ณ จุดตรวจ*',
        'ฝ่ายจักร: Line 8 ' +
          formatValue(a.line8, 'เก๊ะ') +
          ' / Line 2 ' +
          formatValue(a.line2, 'เก๊ะ'),
      );
      for (const b of ['A', 'B', 'C', 'D'])
        lines.push(
          'จุด ' +
            b +
            ': เข้า ' +
            formatValue(a[b + '_in']) +
            ' / หลัง ' +
            formatValue(a[b + '_after']) +
            ' / ออก ' +
            formatValue(a[b + '_out']) +
            ' เก๊ะ',
        );
      lines.push(
        'ล้าง ' +
          formatValue(a.wash, 'เก๊ะ') +
          ' / ซ่อม ' +
          formatValue(a.repair, 'เก๊ะ') +
          ' ในรอบ 30 นาที',
      );
      if (p.repairNo) lines.push('หมายเลขเก๊ะซ่อม ' + p.repairNo);
    }
    if (entries.production) {
      lines.push('', '*ยางเสีย*');
      const values = DEFECTS.map(([k]) => v[k]);
      if (allExplicitZero(values)) lines.push('ยางเสียทุกประเภท 0 ตัน');
      else for (const [k, label] of DEFECTS) lines.push(label + ' ' + formatValue(v[k], 'ตัน'));
    }
    if (entries.packing) {
      const p = entries.packing.payload,
        a = p.values;
      lines.push(
        '',
        '*PACK · ' + p.packCustomer + ' / ' + p.packSo + '*',
        'ทั้งหมด ' + formatValue(a.packTotal, 'ลัง'),
        'STR ' + formatValue(a.packStr, 'ลัง') + ' / PB ' + formatValue(a.packPb, 'ลัง'),
        '',
        '*เข้าโกดัง · ' + p.warehouseCustomer + ' / ' + p.warehouseSo + '*',
        'STR ' + formatValue(a.warehouseStr, 'ลัง') + ' / PB ' + formatValue(a.warehousePb, 'ลัง'),
        '',
        '*Defect · ' + p.defectCustomer + ' / ' + p.defectSo + '*',
      );
      for (const [k, label] of [
        ['steam', 'ไอน้ำ'],
        ['defectWs', 'ยาง WS'],
        ['defectMold', 'ยางรา'],
        ['ct', 'CT'],
        ['defectStr', 'รวม STR'],
        ['defectPb', 'รวม PB'],
      ])
        lines.push(label + ' ' + formatValue(a[k], 'ลัง'));
    }
    const missing = Object.entries(fact.checks || {}).flatMap(([station, check]) =>
      (check.issues || [])
        .filter((i) => i.kind === 'missing')
        .map((i) => (STATIONS.find((s) => s.id === station)?.name || station) + ' · ' + i.message),
    );
    if (missing.length)
      lines.push('', '*ข้อมูลที่ไม่มีตัวเลขและคำอธิบาย*', ...missing.map((s) => '• ' + s));
    const notes = Object.entries(entries).filter(
      ([, e]) => e.payload.notes?.trim() || e.payload.confirmation?.trim(),
    );
    if (notes.length) {
      lines.push('', '*หมายเหตุจาก QA*');
      for (const [id, e] of notes) {
        lines.push(STATIONS.find((s) => s.id === id)?.name || id);
        if (e.payload.notes?.trim()) lines.push(e.payload.notes.trim());
        if (e.payload.confirmation?.trim())
          lines.push('ยืนยันข้อสังเกต: ' + e.payload.confirmation.trim());
      }
    }
    lines.push(
      '',
      'ผู้บันทึก: ' +
        Object.entries(entries)
          .map(
            ([id, e]) => (STATIONS.find((s) => s.id === id)?.name || id) + ' — ' + e.operatorName,
          )
          .join('\n'),
    );
  }
  return lines.join('\n');
}
