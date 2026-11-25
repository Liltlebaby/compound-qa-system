import * as domain from '../../shared/domain.mjs';
import { time } from '../../shared/format/time';
import type { DataRecord as Obj } from '../../shared/types';
import { Badge, Button, Icon } from '../../shared/ui/ui';
import ProductionTrend from './ProductionTrend';
import QualitySnapshot from './QualitySnapshot';
const D: any = domain;
interface DashboardPageProps {
  round: Obj;
  supervisor: boolean;
  fact: Obj;
  order: Obj;
  progress: Obj;
  stationList: Obj[];
  entries: Obj[];
  myQueue: Obj[];
  selected: string;
  openForm: (station: Obj) => void;
  reportReady: boolean;
  closed: boolean;
  stale: boolean;
  warnings: string[];
  share: () => Promise<void>;
  nav: (view: string) => void;
  alarms: Obj[];
  rounds: Obj[];
  submissions: Obj[];
  onRoundChange: (id: string) => void;
}
export default function DashboardPage({
  round,
  supervisor,
  fact,
  order,
  progress,
  stationList,
  entries,
  myQueue,
  selected,
  openForm,
  reportReady,
  closed,
  stale,
  warnings,
  share,
  nav,
  alarms,
  rounds,
  submissions,
  onRoundChange,
}: DashboardPageProps) {
  const required = round.snapshot.requiredStations;
  const received = required.filter((id: string) => entries.some((e) => e.stationId === id)).length;
  const missing = required.filter((id: string) => !entries.some((e) => e.stationId === id));
  const latest = entries
    .map((e) => e.submittedAt)
    .sort()
    .at(-1);
  const active = alarms.filter(
    (a) => a.roundId === round.id && a.orderId === order.id && a.status !== 'resolved',
  );
  const actual = fact.actual,
    target = D.asNumber(order.target);
  const difference = actual !== null && target !== null ? actual - target : null;
  const attention = active.length > 0 || warnings.length > 0 || missing.length > 0;
  const reportStatus = reportReady
    ? 'รายงานพร้อมแชร์'
    : !progress.complete
      ? 'รอข้อมูลครบทุกจุด'
      : !closed
        ? 'ข้อมูลครบแล้ว รอจบรอบ'
        : stale
          ? 'กำลังเตรียมรายงานฉบับแก้ไข'
          : 'กำลังเตรียมรายงาน';
  return (
    <div className="production-dashboard">
      {supervisor ? (
        <section className="dash-production dash-surface" aria-label="ภาพรวมผลผลิตรอบที่เลือก">
          <div className="dash-production-main">
            <div className="dash-production-heading">
              <h2>ผลผลิต PB รอบนี้</h2>
              <span>
                {round.start}–{round.end} · {order.customer} / {order.so}
              </span>
            </div>
            <div className="dash-production-body">
              <div className="dash-actual">
                <strong data-testid="round-actual">{D.numberText(actual)}</strong>
                <span>ตัน</span>
              </div>
              <div className="dash-target-progress">
                <div className="dash-target-label">
                  <span>
                    เป้ารอบนี้ <b>{D.numberText(target)} ตัน</b>
                  </span>
                  <strong data-testid="round-percentage">
                    {fact.percentage === null ? '—' : D.numberText(fact.percentage) + '%'}
                  </strong>
                </div>
                <div
                  className="dash-production-track"
                  role="progressbar"
                  aria-label="ผลผลิตเทียบเป้ารอบนี้"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={
                    fact.percentage === null
                      ? undefined
                      : Math.min(100, Math.max(0, fact.percentage))
                  }
                  aria-valuetext={
                    fact.percentage === null
                      ? 'ยังไม่มีผลผลิตหรือยังไม่กำหนดเป้า'
                      : D.numberText(fact.percentage) + '%'
                  }
                >
                  <span style={{ width: Math.min(100, Math.max(0, fact.percentage || 0)) + '%' }} />
                </div>
                <p
                  className={
                    'dash-target-note ' + (difference !== null && difference < 0 ? 'is-below' : '')
                  }
                >
                  <Icon
                    name={difference === null ? 'clock' : difference < 0 ? 'chart' : 'check'}
                    size={15}
                  />
                  {actual === null
                    ? entries.some((e) => e.stationId === 'production')
                      ? 'ไม่มีตัวเลขผลผลิต · ตรวจคำอธิบายในรายการ'
                      : 'รอ QA ผลผลิตส่งข้อมูลรอบนี้'
                    : target === null || target <= 0
                      ? 'ยังไม่กำหนดเป้าที่ใช้คำนวณ'
                      : difference === 0
                        ? 'ผลิตได้ตามเป้ารอบนี้'
                        : difference! < 0
                          ? (closed ? 'ต่ำกว่าเป้า ' : 'ยังขาดจากเป้า ') +
                            D.numberText(Math.abs(difference!)) +
                            ' ตัน'
                          : 'เกินเป้า ' + D.numberText(difference) + ' ตัน'}
                </p>
              </div>
            </div>
            <p className="dash-production-footnote">
              {latest ? 'บันทึกล่าสุด ' + time(latest) + ' น.' : 'ยังไม่มีข้อมูลที่ส่งสำเร็จ'} ·
              ยอดเฉพาะรอบและ SO ที่เลือก
            </p>
          </div>
          <div className="dash-readiness">
            <h2>ข้อมูล QA</h2>
            <div>
              <strong>
                {received}
                <small> / {required.length} จุด</small>
              </strong>
              <span>{missing.length ? 'รออีก ' + missing.length + ' จุด' : 'ส่งครบแล้ว'}</span>
            </div>
            <div className="dash-readiness-track">
              <span
                style={{ width: (required.length ? (received / required.length) * 100 : 0) + '%' }}
              />
            </div>
            <p>
              {missing.length
                ? missing
                    .map((id: string) => D.STATIONS.find((s: Obj) => s.id === id)?.name || id)
                    .join(' · ')
                : 'ข้อมูลของ SO นี้ครบทุกจุดแล้ว'}
            </p>
          </div>
        </section>
      ) : null}
      <div className={'dash-details-grid ' + (!supervisor ? 'qa-only' : '')}>
        <section className="dash-stations dash-surface">
          <div className="dash-section-heading">
            <h2>สถานะจุดตรวจ</h2>
            <span>
              {stationList.length} จุด · SO {order.so}
            </span>
          </div>
          <div className="dash-station-list">
            {stationList.map((station: Obj) => {
              const entry = entries.find((e) => e.stationId === station.id);
              const pending = myQueue.some(
                (q) =>
                  q.body.roundId === selected &&
                  q.body.orderId === order.id &&
                  q.body.stationId === station.id,
              );
              const observations = entry
                ? D.observations(station.id, entry.payload, order, round.snapshot)
                : [];
              const critical = active.some(
                (a) => a.stationId === station.id && a.severity === 'critical',
              );
              return (
                <button
                  className="dash-station-row"
                  data-qa-station={station.id}
                  key={station.id}
                  onClick={() => openForm(station)}
                  aria-label={
                    station.name +
                    ' · ' +
                    (pending ? 'รอส่ง' : entry ? 'ดูหรือแก้ไขข้อมูล' : 'กรอกข้อมูล')
                  }
                >
                  <span className="dash-station-icon">
                    <Icon name={station.icon} size={22} />
                  </span>
                  <span className="dash-station-name">
                    <strong>{station.name}</strong>
                    <small>
                      {entry
                        ? entry.operatorName
                        : round.snapshot.assignments?.[station.id] || station.description}
                    </small>
                  </span>
                  <span className="dash-station-state">
                    <Badge
                      tone={
                        pending
                          ? 'amber'
                          : critical
                            ? 'red'
                            : entry
                              ? observations.length
                                ? 'amber'
                                : 'green'
                              : 'neutral'
                      }
                      icon={
                        pending
                          ? 'clock'
                          : critical || observations.length
                            ? 'alert'
                            : entry
                              ? 'check'
                              : 'clock'
                      }
                    >
                      {pending
                        ? 'รอส่ง'
                        : critical
                          ? 'มี Alarm'
                          : entry
                            ? observations.length
                              ? 'มีข้อสังเกต'
                              : 'ส่งแล้ว'
                            : 'ยังไม่ส่ง'}
                    </Badge>
                    <small>{entry ? time(entry.submittedAt) + ' น.' : 'รอข้อมูล'}</small>
                  </span>
                  <Icon name="right" size={17} />
                </button>
              );
            })}
          </div>
          <p className="dash-panel-note">
            <Icon name="shield" size={15} />
            <span>กดจุดตรวจเพื่อกรอกหรือดูรายละเอียด · ข้อมูลรวมเมื่อส่งสำเร็จ</span>
          </p>
        </section>
        {supervisor ? (
          <div className="dash-side">
            <QualitySnapshot round={round} order={order} entry={fact.entries.quality} />
            <section
              className={
                'dash-attention ' +
                (active.some((a) => a.severity === 'critical')
                  ? 'critical'
                  : attention
                    ? 'waiting'
                    : 'clear')
              }
            >
              <div className="dash-section-heading">
                <h2>
                  <Icon name={attention ? 'alert' : 'checks'} size={20} />
                  {attention ? 'ต้องติดตาม' : 'ไม่มีรายการต้องติดตาม'}
                </h2>
                {active.length ? (
                  <Button variant="ghost small" onClick={() => nav('alarms')}>
                    ดู Alarm ({active.length})<Icon name="right" size={15} />
                  </Button>
                ) : null}
              </div>
              {missing.length ? (
                <p>
                  <b>รอส่งข้อมูล:</b>{' '}
                  {missing
                    .map((id: string) => D.STATIONS.find((s: Obj) => s.id === id)?.name || id)
                    .join(' · ')}
                </p>
              ) : null}
              {active.length ? (
                <p className="dash-alarm-count">
                  Alarm ที่ยังไม่ปิด {active.length} รายการในรอบ / SO นี้
                </p>
              ) : null}
              {warnings.length ? (
                <ul>
                  {warnings.slice(0, 2).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
              {warnings.length > 2 ? (
                <details>
                  <summary>ข้อสังเกตเพิ่มเติม {warnings.length - 2} รายการ</summary>
                  <ul>
                    {warnings.slice(2).map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {!attention ? <p>ข้อมูลของ SO นี้ครบ และไม่มีข้อสังเกตจากกฎที่ตั้งไว้</p> : null}
            </section>
          </div>
        ) : null}
      </div>
      {supervisor ? (
        <>
          <ProductionTrend
            rounds={rounds}
            submissions={submissions}
            round={round}
            order={order}
            onRoundChange={onRoundChange}
          />
          <section className="dash-report dash-surface">
            <span className="dash-report-icon">
              <Icon name={reportReady ? 'checks' : 'clock'} size={23} />
            </span>
            <div>
              <h2>{reportStatus}</h2>
              <p>
                {!progress.complete
                  ? 'ยังขาด ' +
                    progress.missing.length +
                    ' รายการจากทุก SO ในรอบนี้ · ออกรายงานเมื่อจบรอบและส่งครบ'
                  : !closed
                    ? 'ระบบสรุปเมื่อสิ้นสุดรอบ ' + round.end + ' น.'
                    : 'รายงานรวมทุก SO และบันทึกประวัติฉบับแก้ไข'}
              </p>
            </div>
            <div className="dash-report-actions">
              <Button variant="outline" icon="reports" onClick={() => nav('reports')}>
                ดูรายงาน
              </Button>
              <Button icon="send" disabled={!reportReady} onClick={share}>
                แชร์ WhatsApp
              </Button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
