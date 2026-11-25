import { useState } from 'react';
import * as domain from '../../shared/domain.mjs';
import { Button, Modal, Notice } from '../../shared/ui/ui';
const D: any = domain;
export default function HistoryDateModal({ date, onClose, onChoose }: any) {
  const [value, setValue] = useState(date),
    [error, setError] = useState('');
  return (
    <Modal
      title="ดูข้อมูลตามวันที่"
      subtitle="เลือกวันที่ผลิตเพื่อดูรอบ ข้อมูล QA และรายงานของวันนั้น"
      onClose={onClose}
    >
      <form
        className="modal-body"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!D.validProductionDate(value)) {
            setError('กรุณาเลือกวันที่');
            return;
          }
          try {
            await onChoose(value);
          } catch (e: any) {
            setError(e.message);
          }
        }}
      >
        <label className="input-label">
          วันที่ผลิต
          <input
            type="date"
            required
            value={value}
            max={D.bangkokDate()}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <Notice tone="neutral" icon="calendar">
          กะดึกหลังเที่ยงคืนให้อ้างอิงวันที่เริ่มกะ เช่น รอบ 00:00 ของเช้าวันที่ 30
          ให้เลือกวันที่ผลิต 29
        </Notice>
        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" icon="calendar" className="full">
          ดูข้อมูลวันที่เลือก
        </Button>
        <Button type="button" variant="outline" icon="clock" onClick={() => onChoose(null)}>
          กลับวันปัจจุบัน
        </Button>
      </form>
    </Modal>
  );
}
