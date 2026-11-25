import { useState } from 'react';
import * as domain from '../../shared/domain.mjs';
import { reportTimestamp } from '../../shared/report-format.mjs';
import { Badge, Button, Empty, Icon, Modal, Notice } from '../../shared/ui/ui';
const D: any = domain;
const labels: any = { open: 'รอรับทราบ', acknowledged: 'รับทราบแล้ว', resolved: 'แก้ไขแล้ว' };
export function AlarmBanner({ alarms, onOpen }: any) {
  const active = alarms.filter((a: any) => a.status !== 'resolved');
  if (!active.length) return null;
  const critical = active.filter((a: any) => a.severity === 'critical').length;
  return (
    <section className={'alarm-banner ' + (critical ? 'critical' : 'warning')} aria-live="polite">
      <Icon name="alert" size={24} />
      <div>
        <strong>ALARM · {active.length} รายการที่ยังต้องติดตาม</strong>
        <p>
          {critical ? critical + ' รายการเกินเกณฑ์หรือยอดไม่ตรง · ' : ''}
          {active.filter((a: any) => a.status === 'open').length} รายการรอรับทราบ
        </p>
      </div>
      <Button variant="outline small" onClick={onOpen}>
        ดู Alarm
      </Button>
    </section>
  );
}
export default function AlarmCenter({
  alarms,
  events,
  rounds,
  supervisor,
  onAcknowledge,
  onResolve,
}: any) {
  const [action, setAction] = useState('ack');
  const [filter, setFilter] = useState('active'),
    [target, setTarget] = useState<any>(null),
    [note, setNote] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const visible = alarms
    .filter((a: any) =>
      filter === 'all' || filter === 'active'
        ? filter === 'all' || a.status !== 'resolved'
        : a.status === filter,
    )
    .sort(
      (a: any, b: any) =>
        (a.status === 'resolved' ? 1 : 0) - (b.status === 'resolved' ? 1 : 0) ||
        (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  async function ack() {
    setBusy(true);
    setError('');
    try {
      if (action === 'resolve') await onResolve(target, note);
      else await onAcknowledge(target, note);
      setTarget(null);
      setNote('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="alarm-center">
      <Notice tone="neutral" icon="shield">
        ตรวจตามกฎ Min–Max และความครบถ้วน · ยังไม่เชื่อม AI
        <p>
          การรับทราบไม่ทำให้ค่าที่ผิดเกณฑ์หายไป ปิด Alarm ได้เมื่อส่งค่าที่แก้ไขแล้ว
          หรือหัวหน้าบันทึกผลการแก้ไข โดยเก็บผลตรวจเดิมไว้
        </p>
      </Notice>
      <div className="alarm-filters" aria-label="กรอง Alarm">
        {[
          ['active', 'ยังต้องติดตาม'],
          ['open', 'รอรับทราบ'],
          ['acknowledged', 'รับทราบแล้ว'],
          ['resolved', 'แก้ไขแล้ว'],
          ['all', 'ทั้งหมด'],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={filter === key}
            className={filter === key ? 'active' : ''}
            onClick={() => setFilter(key)}
          >
            {label}
            <span>
              {
                alarms.filter(
                  (a: any) =>
                    key === 'all' ||
                    (key === 'active' ? a.status !== 'resolved' : a.status === key),
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      {!visible.length ? (
        <Empty
          icon="checks"
          title="ไม่มี Alarm ในรายการนี้"
          description="ระบบจะแสดงรายการเมื่อ QA ส่งค่าที่ผิดเกณฑ์ หรือส่งข้อมูลที่ไม่มีตัวเลขพร้อมคำอธิบาย"
        />
      ) : (
        <div className="alarm-list">
          {visible.map((alarm: any) => {
            const round = rounds.find((r: any) => r.id === alarm.roundId),
              order = round?.snapshot.orders.find((o: any) => o.id === alarm.orderId);
            return (
              <article
                key={alarm.id}
                className={
                  'alarm-card ' + (alarm.status === 'resolved' ? 'resolved' : alarm.severity)
                }
              >
                <div className="alarm-card-heading">
                  <span className="alarm-card-icon">
                    <Icon name={alarm.status === 'resolved' ? 'check' : 'alert'} size={21} />
                  </span>
                  <div>
                    <strong>
                      {D.STATIONS.find((s: any) => s.id === alarm.stationId)?.name} ·{' '}
                      {alarm.details.label}
                    </strong>
                    <p>
                      {order?.customer} / {order?.so} · รอบ {round?.start}–{round?.end}
                    </p>
                  </div>
                  <Badge tone={alarm.status === 'resolved' ? 'green' : 'neutral'}>
                    {labels[alarm.status]}
                  </Badge>
                </div>
                <p className="alarm-message">{alarm.message}</p>
                <div className="alarm-time">
                  พบครั้งแรก {reportTimestamp(alarm.firstSeenAt)}
                  <br />
                  อัปเดต {reportTimestamp(alarm.updatedAt)}
                </div>
                {alarm.acknowledgedAt ? (
                  <p className="alarm-ack-info">
                    รับทราบโดย {alarm.acknowledgedName} · {reportTimestamp(alarm.acknowledgedAt)}
                    {alarm.ackNote ? <span>{alarm.ackNote}</span> : null}
                  </p>
                ) : null}
                {supervisor && alarm.status === 'open' ? (
                  <Button
                    variant="outline small"
                    icon="check"
                    onClick={() => {
                      setAction('ack');
                      setTarget(alarm);
                      setNote('');
                      setError('');
                    }}
                  >
                    รับทราบ Alarm
                  </Button>
                ) : null}
                {supervisor && alarm.status !== 'resolved' ? (
                  <Button
                    variant="ghost small"
                    icon="edit"
                    onClick={() => {
                      setAction('resolve');
                      setTarget(alarm);
                      setNote('');
                      setError('');
                    }}
                  >
                    บันทึกการแก้ไข
                  </Button>
                ) : null}
                {alarm.resolutionMethod === 'manual' ? (
                  <p className="alarm-ack-info">
                    ปิดโดย {alarm.resolvedName} · {reportTimestamp(alarm.resolvedAt)}
                    <span>{alarm.resolutionNote}</span>
                    <small>เก็บผลตรวจเดิมไว้</small>
                  </p>
                ) : null}
                <details className="alarm-history">
                  <summary>ประวัติ Alarm</summary>
                  {events
                    .filter((e: any) => e.alarmId === alarm.id)
                    .map((event: any) => (
                      <div key={event.id}>
                        <strong>
                          {{
                            opened: 'เกิด Alarm',
                            reopened: 'แจ้งเตือนอีกครั้ง',
                            acknowledged: 'รับทราบ',
                            resolved: 'แก้ไขแล้ว',
                          }[event.action as string] || event.action}
                        </strong>
                        <span>
                          {reportTimestamp(event.at)} · {event.actorName}
                        </span>
                        {event.note ? <p>{event.note}</p> : null}
                      </div>
                    ))}
                </details>
              </article>
            );
          })}
        </div>
      )}
      {target ? (
        <Modal
          title={action === 'resolve' ? 'บันทึกการแก้ไข / ปิด Alarm' : 'รับทราบ Alarm'}
          subtitle={target.message}
          onClose={() => setTarget(null)}
        >
          <div className="modal-body">
            <Notice>
              {action === 'resolve'
                ? 'บันทึกวิธีแก้ไขและผลติดตามเพื่อปิด Alarm ผลตรวจเดิมในรายงานจะยังอยู่'
                : 'การรับทราบยังต้องติดตามต่อจนแก้ไขแล้ว'}
            </Notice>
            <label className="input-label">
              {action === 'resolve'
                ? 'วิธีแก้ไข / ผลติดตาม (จำเป็น)'
                : 'หมายเหตุ / แนวทางติดตาม (ถ้ามี)'}
              <textarea
                value={note}
                maxLength={500}
                rows={3}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {error ? (
              <p className="error-text" role="alert">
                {error}
              </p>
            ) : null}
            <Button icon="check" busy={busy} onClick={ack}>
              {action === 'resolve' ? 'ยืนยันปิด Alarm' : 'ยืนยันรับทราบ'}
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
