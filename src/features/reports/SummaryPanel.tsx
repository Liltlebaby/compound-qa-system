import * as domain from '../../shared/domain.mjs';
import type { DataRecord as Obj } from '../../shared/types';
import { Badge, Button, Notice } from '../../shared/ui/ui';
const D: any = domain;
interface SummaryPanelProps {
  round: Obj;
  order: Obj;
  fact: Obj;
  progress: Obj;
  entries: Obj[];
  warnings: string[];
  reportReady: boolean;
  closed: boolean;
  stale: boolean;
  share: () => Promise<void>;
  nav: (view: string) => void;
}
export default function SummaryPanel({
  round,
  order,
  fact,
  progress,
  entries,
  warnings,
  reportReady,
  closed,
  stale,
  share,
  nav,
}: SummaryPanelProps) {
  return (
    <section className="panel summary-panel">
      <div className="section-heading">
        <h2>สรุปรอบการผลิต</h2>
        <Badge tone={reportReady ? 'green' : 'amber'} icon={reportReady ? 'check' : 'clock'}>
          {reportReady ? 'พร้อมแชร์' : progress.complete ? 'รอปิดรอบ' : 'รอข้อมูล'}
        </Badge>
      </div>
      {!progress.complete ? (
        <Notice>
          <strong>รอข้อมูลครบทุกจุด</strong>
          <p>ยังขาด {progress.missing.length} รายการ · ระบบจะสรุปเมื่อส่งครบ</p>
        </Notice>
      ) : !closed ? (
        <Notice tone="neutral" icon="clock">
          ข้อมูลครบแล้ว · รอปิดรอบ {round.end} น.
        </Notice>
      ) : stale ? (
        <Notice>ข้อมูลมีการแก้ไข กำลังเตรียมฉบับใหม่</Notice>
      ) : null}
      <div className="summary-context">
        <div>
          <span>ลูกค้า / SO ผลิต</span>
          <strong>
            {order.customer} / {order.so}
          </strong>
        </div>
        <div>
          <span>วันที่ / กะ</span>
          <span>
            {D.displayDate(round.date)} · {round.shift}
          </span>
        </div>
        <div>
          <span>รอบเวลา</span>
          <span>
            {round.start}–{round.end}
          </span>
        </div>
      </div>
      {entries.some((e: Obj) => e.stationId === 'quality') ? (
        <div className="quality-summary">
          <h3>ผลคุณภาพ</h3>
          {['po', 'pri', 'mv'].map((k) => {
            const v = fact.entries.quality?.payload.values[k],
              spec = order.specs[k],
              n = D.asNumber(v),
              bad = spec && n !== null && (n < spec[0] || n > spec[1]);
            return (
              <div key={k}>
                <span>{k.toUpperCase()}</span>
                <strong className={bad ? 'error-text' : ''}>{D.formatValue(v)}</strong>
                <small>
                  {!spec
                    ? 'ไม่มีเกณฑ์สเปก'
                    : n === null
                      ? 'ไม่ตัดสินผล'
                      : bad
                        ? 'นอกสเปก'
                        : 'อยู่ในสเปก'}
                </small>
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="summary-numbers">
        <div>
          <strong>ผลผลิต PB</strong>
          <strong>{D.numberText(fact.actual)} ตัน</strong>
        </div>
        <div>
          <span>เป้ารอบนี้</span>
          <span>{D.numberText(order.target)} ตัน</span>
        </div>
        <div>
          <span>ความสำเร็จ</span>
          <strong className="accent">{D.numberText(fact.percentage)}%</strong>
        </div>
      </div>
      {warnings.map((w: string) => (
        <Notice key={w}>{w}</Notice>
      ))}
      <div className="report-buttons">
        <Button icon="send" disabled={!reportReady} onClick={share} className="full">
          แชร์เข้า WhatsApp
        </Button>
        {reportReady ? (
          <Button variant="ghost small" icon="reports" onClick={() => nav('reports')}>
            ดูรายงานฉบับเต็ม
          </Button>
        ) : (
          <small>ออกรายงานเมื่อจบรอบและข้อมูลครบทุกจุด</small>
        )}
      </div>
    </section>
  );
}
