import { useState } from 'react';
import * as domain from '../../shared/domain.mjs';
import type { DataRecord as Obj } from '../../shared/types';
import { Button, Modal, Notice } from '../../shared/ui/ui';
const D: any = domain;
export default function RoundModal({ config, demo, onClose, onCreate }: any) {
  const [date, setDate] = useState(D.currentSlot(config)?.date || D.bangkokDate()),
    [start, setStart] = useState(D.currentStart()),
    [shift, setShift] = useState(config.shift),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="เปิดรอบย้อนหลัง / เพิ่มเติม"
      subtitle="ระบบเก็บแผนและสเปกของรอบนี้ไว้เพื่ออ้างอิงย้อนหลัง"
      onClose={onClose}
    >
      <form
        className="modal-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onCreate({ date, start, shift });
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="input-label">
          วันที่ผลิต
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="two-col">
          <label className="input-label">
            เริ่มรอบ
            <select value={start} onChange={(e) => setStart(e.target.value)}>
              {Array.from({ length: 48 }, (_, i) => {
                const v = String(Math.floor(i / 2)).padStart(2, '0') + ':' + (i % 2 ? '30' : '00');
                return <option key={v}>{v}</option>;
              })}
            </select>
          </label>
          <label className="input-label">
            กะ
            <input value={config.factory + ' · ' + shift} readOnly />
          </label>
        </div>
        <Notice tone="neutral" icon="clock">
          รอบ {start}–{D.roundTiming(config, date, start).end} · {config.line}
          <p>{config.orders.map((o: Obj) => o.customer + '/' + o.so).join(' · ')}</p>
        </Notice>
        {!demo && !config.unitConfirmed && config.requiredStations.includes('oven') ? (
          <Notice>ต้องยืนยันชื่อและหน่วย Burner / Biscuit ในตั้งค่าก่อนเปิดรอบจริง</Notice>
        ) : null}
        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" icon="plus" busy={busy} className="full">
          เปิดรอบ 30 นาที
        </Button>
      </form>
    </Modal>
  );
}
