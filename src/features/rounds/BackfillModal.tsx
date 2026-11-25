'use client';
import { useEffect, useState } from 'react';
import * as domain from '../../shared/domain.mjs';
import Select from '../../shared/ui/Select';
import { Button, Modal, Notice } from '../../shared/ui/ui';
const D: any = domain;
type Obj = Record<string, any>;
export default function BackfillModal({
  config,
  stations,
  stationId,
  lockedStation,
  initialRound,
  onLoadDay,
  onOpen,
  onClose,
}: any) {
  const latest = D.latestCompletedSlot(config),
    closed = initialRound && Date.parse(initialRound.endAt) <= Date.now();
  const [date, setDate] = useState(
      closed ? initialRound.date : latest?.date || D.productionDate(config),
    ),
    [start, setStart] = useState(closed ? initialRound.start : latest?.start || ''),
    [point, setPoint] = useState(stationId),
    [day, setDay] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  function available(data: any) {
    const cfg = data.config || config,
      at = new Date(data.serverTime || Date.now());
    const existing = data.rounds.filter(
      (r: Obj) => r.line === config.line && r.date === date && Date.parse(r.endAt) <= at.getTime(),
    );
    const times = [
      ...new Set<string>([...D.shiftStarts(cfg), ...existing.map((r: Obj) => r.start)]),
    ];
    return times
      .filter(
        (t) => existing.some((r: Obj) => r.start === t) || !D.backfillSlotIssue(cfg, date, t, at),
      )
      .sort((a, b) =>
        (
          existing.find((r: Obj) => r.start === a)?.endAt || D.roundTiming(cfg, date, a).endAt
        ).localeCompare(
          existing.find((r: Obj) => r.start === b)?.endAt || D.roundTiming(cfg, date, b).endAt,
        ),
      );
  }
  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError('');
    setConfirmed(false);
    onLoadDay(date)
      .then((data: any) => {
        if (canceled) return;
        setDay(data);
        const times = available(data);
        setStart((prev: string) => (times.includes(prev) ? prev : times.at(-1) || ''));
      })
      .catch((e: any) => {
        if (!canceled) {
          setDay(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [date]);
  const times = day ? available(day) : [],
    existing = day?.rounds.find(
      (r: Obj) => r.date === date && r.start === start && r.line === config.line,
    ),
    plan = existing?.snapshot || day?.config || config;
  return (
    <Modal
      title="กรอกข้อมูลย้อนหลัง"
      subtitle={
        config.factory + ' · ' + config.shift + ' · ' + config.line + ' — โรงและกะตามจุดที่เปิด'
      }
      onClose={onClose}
    >
      <form
        className="modal-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setBusy(true);
          try {
            await onOpen({
              date,
              start,
              stationId: point,
              confirmPlan: confirmed,
              expectedConfigVersion: day?.configVersion,
            });
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="two-col">
          <label className="input-label">
            วันที่ผลิตย้อนหลัง
            <input
              type="date"
              required
              max={D.bangkokDate()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="input-label">
            รอบเวลาย้อนหลัง
            <Select
              label="รอบเวลาย้อนหลัง"
              value={start}
              disabled={loading || !times.length}
              placeholder={loading ? 'กำลังโหลดรอบ' : 'ยังไม่มีรอบที่จบแล้ว'}
              onValueChange={(value) => {
                setStart(value);
                setConfirmed(false);
              }}
              options={times.map((t) => ({
                value: t,
                label: t + '–' + D.roundTiming(plan, date, t).end,
                description: day?.rounds.some(
                  (r: Obj) => r.date === date && r.start === t && r.line === config.line,
                )
                  ? 'มีรอบที่บันทึกไว้แล้ว'
                  : 'สร้างรอบย้อนหลัง',
                badge: day?.rounds.some(
                  (r: Obj) => r.date === date && r.start === t && r.line === config.line,
                )
                  ? 'มีรอบแล้ว'
                  : undefined,
              }))}
            />
          </label>
        </div>
        {lockedStation ? (
          <Notice tone="neutral" icon="shield">
            จุดตรวจ {D.STATIONS.find((s: Obj) => s.id === point)?.name} · โรงและกะยังเป็นชุดเดิมตาม
            QR
          </Notice>
        ) : (
          <label className="input-label">
            จุดตรวจย้อนหลัง
            <Select
              label="จุดตรวจย้อนหลัง"
              value={point}
              onValueChange={setPoint}
              options={stations.map((s: Obj) => ({ value: s.id, label: s.name }))}
            />
          </label>
        )}
        {!loading && day && start ? (
          <>
            <Notice tone={existing ? 'neutral' : 'amber'} icon="history">
              {existing
                ? 'ใช้แผนและสเปกที่เก็บไว้กับรอบเดิม'
                : 'ยังไม่มีรอบนี้ ต้องยืนยันแผนก่อนสร้างรอบย้อนหลัง'}
              <p>
                {plan.orders
                  .map(
                    (o: Obj) =>
                      o.customer +
                      '/' +
                      o.so +
                      ' · เป้า ' +
                      o.target +
                      ' ตัน · PO ' +
                      (o.specs.po?.join('–') || 'ไม่มีเกณฑ์') +
                      ' · PRI ' +
                      (o.specs.pri?.join('–') || 'ไม่มีเกณฑ์') +
                      ' · MV ' +
                      (o.specs.mv?.join('–') || 'ไม่มีเกณฑ์'),
                  )
                  .join(' / ')}
              </p>
            </Notice>
            {!existing ? (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                ตรวจสอบแล้วว่าแผนและสเปกข้างต้นใช้กับรอบย้อนหลังนี้
              </label>
            ) : null}
          </>
        ) : null}
        <p className="muted tiny">
          กะดึกหลังเที่ยงคืนใช้วันที่เริ่มกะ · เลือกได้เฉพาะรอบที่จบแล้ว ·
          ระบบเก็บชื่อผู้กรอกและเวลาส่งจริง
        </p>
        {error ? <Notice tone="red">{error}</Notice> : null}
        <Button
          type="submit"
          icon="history"
          busy={busy}
          disabled={loading || !day || !start || !point || (!existing && !confirmed)}
          className="full"
        >
          เข้ากรอกข้อมูลรอบนี้
        </Button>
      </form>
    </Modal>
  );
}
