import * as domain from '../domain.mjs';
const D: any = domain;
export type Data = Record<string, any>;
export const KEY = 'compound-qa:v1:';
export function readLocal(key: string, fallback: any) {
  try {
    const raw = localStorage.getItem(KEY + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: any) {
  try {
    localStorage.setItem(KEY + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function removeLocal(key: string) {
  try {
    localStorage.removeItem(KEY + key);
  } catch {}
}
export async function api(path: string, body?: any): Promise<any> {
  const response = await fetch('/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(60000),
  });
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw Object.assign(new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่'), {
      status: response.status,
    });
  }
  if (!response.ok)
    throw Object.assign(new Error(data.error || 'บันทึกไม่สำเร็จ'), { status: response.status });
  return data;
}
export function draftKey(
  demo: boolean,
  userId: string,
  roundId: string,
  orderId: string,
  stationId: string,
) {
  return ['draft', demo ? 'demo' : 'live', userId, roundId, orderId, stationId].join(':');
}
export function blankPayload(station: string, config: Data, order: Data, ovenSettings?: Data) {
  const payload: any = {
    values: Object.fromEntries(
      D.fieldsFor(station, config, order).map((f: Data) => [f.key, f.defaultValue ?? '']),
    ),
    notes: '',
    replacementFor: '',
    confirmation: '',
    packCustomer: order.customer,
    packSo: order.so,
    warehouseCustomer: order.customer,
    warehouseSo: order.so,
    defectCustomer: order.customer,
    defectSo: order.so,
    washNo: '',
    repairNo: '',
  };
  return station === 'oven' && config.ovenEntryMode === 'measurements-and-settings'
    ? D.prepareOvenPayload(payload, ovenSettings || D.ovenSettingDefaults(order))
    : payload;
}
export function download(name: string, content: string, type = 'text/plain;charset=utf-8') {
  const u = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
}
export async function shareReport(text: string) {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'COMPOUND QA', text });
      return 'เปิดเมนูแชร์แล้ว กรุณาเลือก WhatsApp และกลุ่มปลายทาง';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'ยกเลิกการแชร์';
    }
  }
  const w = window.open(
    'https://wa.me/?text=' + encodeURIComponent(text),
    '_blank',
    'noopener,noreferrer',
  );
  return w
    ? 'เปิด WhatsApp แล้ว กรุณาเลือกกลุ่มและยืนยันส่ง'
    : 'เปิด WhatsApp เพื่อเลือกกลุ่ม หากไม่เปิดให้ใช้ปุ่มคัดลอก';
}
