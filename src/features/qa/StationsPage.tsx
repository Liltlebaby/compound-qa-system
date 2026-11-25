import * as domain from '../../shared/domain.mjs';
import { time } from '../../shared/format/time';
import type { DataRecord as Obj } from '../../shared/types';
import { Badge, Button, Icon } from '../../shared/ui/ui';
const D: any = domain;
interface StationsPageProps {
  round: Obj;
  order: Obj;
  scanStationId: string;
  stationList: Obj[];
  entries: Obj[];
  openForm: (station: Obj) => void;
  setHistory: (history: Obj) => void;
}
export default function StationsPage({
  round,
  order,
  scanStationId,
  stationList,
  entries,
  openForm,
  setHistory,
}: StationsPageProps) {
  return (
    <>
      <div className="section-intro">
        <h2>{scanStationId ? 'จุดตรวจที่สแกน' : 'เลือกจุดที่ต้องการบันทึก'}</h2>
        <p>ข้อมูลแต่ละจุดแยกตามรอบและ SO · กรอกเฉพาะค่าที่ตรวจจริง</p>
      </div>
      <div className="station-cards">
        {stationList.map((s: Obj) => {
          const e = entries.find((x: Obj) => x.stationId === s.id),
            w = e ? D.observations(s.id, e.payload, order, round.snapshot) : [];
          return (
            <article className="station-card" data-qa-station={s.id} key={s.id}>
              <div className="station-card-top">
                <span className="icon-square">
                  <Icon name={s.icon} size={26} />
                </span>
                <Badge
                  tone={e ? (w.length ? 'amber' : 'green') : 'neutral'}
                  icon={e ? 'check' : 'clock'}
                >
                  {e ? (w.length ? 'มีข้อสังเกต' : 'ส่งแล้ว') : 'ยังไม่ส่ง'}
                </Badge>
              </div>
              <h2>{s.name}</h2>
              <p>{s.description}</p>
              <div className="station-card-meta">
                <span>
                  {e?.operatorName || round.snapshot.assignments?.[s.id] || 'รอผู้บันทึก'}
                </span>
                <small>
                  {e
                    ? 'เวอร์ชัน ' + e.version + ' · ' + time(e.submittedAt)
                    : 'รอบ ' + round.start + '–' + round.end}
                </small>
              </div>
              <div className="station-card-actions">
                <Button
                  variant={e ? 'outline' : ''}
                  icon={e ? 'edit' : 'plus'}
                  onClick={() => openForm(s)}
                >
                  {e ? 'ดู / แก้ไขข้อมูล' : 'กรอกข้อมูล'}
                </Button>
                {e ? (
                  <Button
                    variant="ghost"
                    icon="history"
                    aria-label={'ประวัติ ' + s.name}
                    onClick={() => setHistory({ station: s, round, order })}
                  />
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
