import qrcode from 'qrcode-generator';
import { FACTORY_SHIFTS, STATIONS, scheduleFor, stationQrUrl } from '../../shared/domain.mjs';

export const QR_FONT_URL = '/fonts/NotoSansThai-Variable.ttf';
export const QR_GROUPS = [
  { factory: 'AJ2', shift: 'กะเช้า', key: 'AJ2-day', color: '#17684e', light: '#e6f2eb' },
  { factory: 'AJ2', shift: 'กะดึก', key: 'AJ2-night', color: '#233c63', light: '#e8eef7' },
  { factory: 'AJ2B', shift: 'กะเช้า', key: 'AJ2B-day', color: '#a26328', light: '#fbf0df' },
];
const STATION_COPY = {
  oven: { code: 'OVN', detail: 'PV · Biscuit · อุณหภูมิยาง' },
  quality: { code: 'QUA', detail: 'ผลตรวจ PO / PRI / MV' },
  production: { code: 'PRD', detail: 'ผลผลิต PB · ยางเสียแยกประเภท' },
  crates: { code: 'TWR', detail: 'เก๊ะ A–D · ฝ่ายจักร · ล้าง/ซ่อม' },
  packing: { code: 'PCK', detail: 'บรรจุ · เข้าโกดัง · defect' },
};

export function qrAddress(input) {
  try {
    const url = new URL(input);
    const loopback = ['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0'].includes(url.hostname);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || loopback)
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function qrPosters(config, base, demo = false) {
  const group = QR_GROUPS.find(
    (item) => item.factory === config.factory && item.shift === config.shift,
  );
  if (!group || !FACTORY_SHIFTS[config.factory]?.some((item) => item.name === config.shift))
    throw new Error('โรงหรือกะสำหรับป้ายไม่ถูกต้อง');
  const schedule = scheduleFor(config);
  return STATIONS.filter((station) => config.requiredStations.includes(station.id)).map(
    (station) => {
      const number = String(STATIONS.findIndex((item) => item.id === station.id) + 1).padStart(
        2,
        '0',
      );
      return {
        ...group,
        stationId: station.id,
        name: station.name,
        icon: station.icon,
        ...STATION_COPY[station.id],
        number,
        line: config.line,
        start: schedule.start,
        end: schedule.end,
        demo,
        url: stationQrUrl(base, config, station.id, demo),
        labelId: `${group.key}-${config.line.replaceAll(/[^a-zA-Z0-9]+/g, '-')}-${STATION_COPY[station.id].code}`,
      };
    },
  );
}

const xml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

// Lucide outline geometry, matching the icon family used throughout the QA application.
const GLYPHS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
  flame:
    '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
  flask:
    '<path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2M6.453 15h11.094M8.5 2h7"/>',
  chart:
    '<path d="M12 16v5m4-6.361V21m4-10.344V21m2-18-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15m2 3.463V21m4-6.344V21"/>',
  box: '<path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Zm4.03 3.58-4.74-2.85M7 16.5l5-3M7 16.5v5.17M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Zm5 3-5-3m5 3 4.74-2.85M17 16.5v5.17M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8ZM12 8 7.26 5.15M12 8l4.74-2.85M12 13.5V8"/>',
  warehouse:
    '<path d="M18 21V10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v11m16-2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 1.132-1.803l7.95-3.974a2 2 0 0 1 1.837 0l7.948 3.974A2 2 0 0 1 22 8ZM6 13h12M6 17h12"/>',
  arrow: '<path d="M5 12h14m-7-7 7 7-7 7"/>',
};
const glyph = (name, x, y, size, color) =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[name]}</svg>`;

/** One vector template is used by the browser, SVG download, PNG exports and PDF printing. */
export function posterSvg(poster, { fontData = '' } = {}) {
  const q = qrcode(0, 'M');
  q.addData(poster.url);
  q.make();
  const qr = q
    .createSvgTag({ cellSize: 1, margin: 4, scalable: true })
    .replace(
      '<svg ',
      '<svg x="160" y="415" width="280" height="280" shape-rendering="crispEdges" ',
    );
  const title = `${poster.factory} · ${poster.shift} · ${poster.name} · ${poster.line}`;
  const face = fontData
    ? `@font-face{font-family:QAPoster;src:url(data:font/ttf;base64,${fontData}) format('truetype');font-weight:100 900;}`
    : '';
  const nameSize = poster.stationId === 'packing' ? 42 : poster.stationId === 'quality' ? 56 : 60;
  const { color, light } = poster;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="848.5714" viewBox="0 0 600 848.5714" role="img" aria-label="${xml(title)}">
<title>${xml(title)}</title><desc>${xml(poster.url)}</desc>
<style>${face}text{font-family:QAPoster,'Noto Sans Thai',Tahoma,sans-serif;font-kerning:normal}</style>
<rect width="600" height="848.5714" fill="#fff"/>
<text x="32" y="42" font-size="23" font-weight="800" fill="#17221d">COMPOUND QA</text>
<text x="568" y="42" text-anchor="end" font-size="18" font-weight="600" fill="#17221d">${xml(poster.line)}</text>
<rect x="16" y="62" width="568" height="145" fill="${color}"/>
<text x="300" y="183" text-anchor="middle" font-size="124" letter-spacing="-4" font-weight="800" fill="#fff">${xml(poster.factory)}</text>
<rect x="16" y="207" width="568" height="74" fill="${light}"/>
${glyph(poster.shift === 'กะดึก' ? 'moon' : 'sun', 39, 221, 46, color)}
<path d="M108 224v40" stroke="${color}" stroke-width="1.5"/>
<text x="136" y="258" font-size="38" font-weight="750" fill="${color}">${xml(poster.shift)}</text>
<text x="561" y="254" text-anchor="end" font-size="25" font-weight="650" fill="${color}">${xml(poster.start)}–${xml(poster.end)}</text>
<text x="39" y="365" font-size="58" font-weight="800" fill="${color}">${poster.number}</text>
<path d="M132 310v57" stroke="${color}" stroke-width="1.5"/>
${glyph(poster.icon, 151, 307, 63, color)}
<text x="230" y="363" font-size="${nameSize}" font-weight="750" fill="${color}">${xml(poster.name)}</text>
<text x="300" y="405" text-anchor="middle" font-size="21" font-weight="550" fill="#17221d">${xml(poster.detail)}</text>
<a href="${xml(poster.url)}" target="_blank">${qr}</a>
<text x="300" y="725" text-anchor="middle" font-size="27" font-weight="750" fill="#17221d">สแกนเพื่อบันทึกข้อมูล</text>
<path d="M32 746H568" stroke="${color}" stroke-width="1.5"/>
${[1, 2, 3].map((number, index) => `<circle cx="${57 + index * 186}" cy="775" r="17" fill="${color}"/><text x="${57 + index * 186}" y="782" text-anchor="middle" font-size="21" font-weight="650" fill="#fff">${number}</text><text x="${86 + index * 186}" y="782" font-size="20" font-weight="650" fill="#17221d">${['สแกน', 'กรอก', 'ส่ง'][index]}</text>`).join('')}
${glyph('arrow', 179, 763, 24, '#17221d')}${glyph('arrow', 365, 763, 24, '#17221d')}
<text x="300" y="812" text-anchor="middle" font-size="15" font-weight="500" fill="${poster.demo ? '#a83232' : '#17221d'}">${poster.demo ? 'ข้อมูลสาธิต · ไม่ใช้บันทึกงานจริง' : 'Wi-Fi โรงงาน · ทุก 30 นาที'}</text>
<text x="32" y="827" font-size="10" fill="#69746e">${xml(new URL(poster.url).host)}</text>
<text x="568" y="827" text-anchor="end" font-size="10" fill="#69746e">${xml(poster.labelId)}</text>
${poster.demo ? '<text x="300" y="40" font-size="12" text-anchor="middle" font-weight="700" fill="#a83232">สาธิต</text>' : ''}
</svg>`;
}
