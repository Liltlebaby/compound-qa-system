import { Button, Icon } from '../../shared/ui/ui';

const instructions: Record<string, { title: string; detail: string }> = {
  oven: {
    title: 'วัดจริง 3 ค่า แล้วไปเตาถัดไป',
    detail: 'PV · น้ำหนัก Biscuit · อุณหภูมิก้อนยาง ส่วน SV / เวลาอบแก้เมื่อเปลี่ยน',
  },
  quality: {
    title: 'กรอกผลตรวจ PO · PRI · MV',
    detail: 'ใช้ค่าที่ตรวจจริง ช่องจะแสดงสีแดงเมื่อออกนอกสเปกที่กำหนด',
  },
  production: {
    title: 'เริ่มที่ผลผลิต PB ของรอบนี้',
    detail: 'กรอกหน่วยตัน · ยางเสียเริ่มที่ 0 แล้วแก้เฉพาะประเภทที่พบ',
  },
  crates: {
    title: 'เลือกจุด แล้วกรอกจำนวนเก๊ะ',
    detail: 'ฝ่ายจักร → เตา A–D → ล้าง/ซ่อม · ไม่มีจำนวนให้กรอก 0',
  },
  packing: {
    title: 'ตรวจ SO แล้วกรอกจำนวนลัง',
    detail: 'แยก PACK / เข้าโกดัง / defect · จำนวนเริ่มที่ 0 แก้ตามที่พบจริง',
  },
};

export default function EntryGuide({
  stationId,
  complete,
  total,
  onContinue,
  closedCount = 0,
}: {
  stationId: string;
  complete: number;
  total: number;
  onContinue: () => void;
  closedCount?: number;
}) {
  const guide = instructions[stationId];
  if (!guide) return null;
  const allDone = complete === total;
  return (
    <section className="qa-entry-guide" aria-label="วิธีกรอกข้อมูล">
      <div className="qa-guide-heading">
        <Icon name={allDone ? 'checks' : 'edit'} size={18} />
        <strong>
          {stationId === 'oven' && closedCount === 4 ? 'ทุกเตาปิดในรอบนี้' : guide.title}
        </strong>
      </div>
      <p>
        {stationId === 'oven' && closedCount
          ? 'เตาปิด ' + closedCount + ' เตา · กรอกค่าตรวจเฉพาะเตาที่ใช้งาน'
          : guide.detail}
      </p>
      <div className="qa-guide-progress">
        <div>
          <span>รายการพร้อมตรวจ</span>
          <strong>
            {complete}
            <small> / {total}</small>
          </strong>
        </div>
        <div
          className="qa-progress-track"
          role="progressbar"
          aria-label="รายการพร้อมตรวจ รวมช่องที่มีคำอธิบายหรือระบุเตาปิดแล้ว"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={complete}
        >
          <span style={{ width: `${total ? (complete / total) * 100 : 0}%` }} />
        </div>
      </div>
      <div className="qa-guide-action">
        <span>ไม่มีตัวเลข? ระบุคำอธิบายที่ช่องนั้น</span>
        <Button variant="small" icon={allDone ? 'checks' : 'right'} onClick={onContinue}>
          {allDone ? 'ตรวจทานข้อมูล' : complete ? 'ไปช่องที่ยังไม่ครบ' : 'เริ่มกรอกข้อมูล'}
        </Button>
      </div>
    </section>
  );
}
