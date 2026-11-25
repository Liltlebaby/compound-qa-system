import { useState } from 'react';
import * as domain from '../../shared/domain.mjs';
import type { DataRecord as Obj } from '../../shared/types';
import { Button, Empty, Modal } from '../../shared/ui/ui';
const D: any = domain;
export default function AddOrderModal({ config, round, onClose, onAdd, onSettings }: any) {
  const available = config.orders.filter(
    (o: Obj) => !round.snapshot.orders.some((r: Obj) => r.id === o.id),
  );
  const [id, setId] = useState(available[0]?.id || ''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="เพิ่ม SO ในรอบที่กำลังผลิต"
      subtitle="แต่ละ SO จะมีข้อมูลและสถานะส่งครบของตัวเอง"
      onClose={onClose}
    >
      <div className="modal-body">
        {available.length ? (
          <>
            <label className="input-label">
              เลือกงานจากแผนผลิต
              <select value={id} onChange={(e) => setId(e.target.value)}>
                {available.map((o: Obj) => (
                  <option value={o.id} key={o.id}>
                    {o.customer} / {o.so} · เป้า {o.target} ตัน
                  </option>
                ))}
              </select>
            </label>
            {error ? <p className="error-text">{error}</p> : null}
            <Button
              busy={busy}
              icon="plus"
              onClick={async () => {
                setBusy(true);
                try {
                  await onAdd(id);
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              เพิ่ม SO ในรอบนี้
            </Button>
          </>
        ) : (
          <Empty
            title="ยังไม่มี SO อื่นในแผน"
            description="เพิ่มลูกค้า/SO ในตั้งค่าแผนผลิตก่อน แล้วกลับมาเพิ่มเข้าในรอบนี้"
            action={
              <Button onClick={onSettings} icon="settings">
                ไปตั้งค่าแผนผลิต
              </Button>
            }
          />
        )}
      </div>
    </Modal>
  );
}
