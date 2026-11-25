'use client';
import { useEffect, useRef, useState } from 'react';
import { blankPayload, draftKey, readLocal, writeLocal } from '../../shared/api/client';
import * as domain from '../../shared/domain.mjs';
import { Badge, Button, Icon, Notice } from '../../shared/ui/ui';
import FieldAssist from './FieldAssist';
import OvenEntry from './OvenEntry';
import TowerEntry from './TowerEntry';
import EntryGuide from './EntryGuide';
const D: any = domain;
export default function QAForm({
  station,
  round,
  order,
  user,
  existing,
  demo,
  pending,
  onSubmit,
  onOrderChange,
  onClose,
  onToast,
  onBackfill,
  ovenSettings,
}: any) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const el = dialog.current;
    const close = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el?.addEventListener('cancel', close);
    return () => {
      el?.removeEventListener('cancel', close);
      el?.close();
    };
  }, []);
  const key = draftKey(demo, user.id, round.id, order.id, station.id);
  const modernOven =
      station.id === 'oven' && round.snapshot.ovenEntryMode === 'measurements-and-settings',
    baseline = ovenSettings || D.ovenSettingDefaults(order);
  const tower = station.id === 'crates',
    compactForm = modernOven || tower;
  const [activeTower, setActiveTower] = useState('machine');
  const [activeOven, setActiveOven] = useState('A');
  const ovenReadings = useRef<Record<string, any>>({});
  const [data, setData] = useState<any>(() => {
    const initial = readLocal(key, {
      payload:
        pending?.body?.payload ||
        existing?.payload ||
        blankPayload(station.id, round.snapshot, order, baseline),
      reason: '',
      baseVersion: existing?.version || 0,
    });
    // Upgrade old, unsent drafts once. Saved data and queued requests retain their original values.
    const defaultsKey =
      station.id === 'packing'
        ? 'packingDefaultsVersion'
        : station.id === 'production'
          ? 'productionDefaultsVersion'
          : null;
    if (
      defaultsKey &&
      !existing &&
      !pending &&
      !initial.baseVersion &&
      initial[defaultsKey] !== 1
    ) {
      const values = { ...initial.payload.values };
      for (const field of D.fieldsFor(station.id, round.snapshot, order)) {
        const current = values[field.key];
        if (
          field.defaultValue !== undefined &&
          (current === undefined ||
            current === null ||
            (typeof current === 'string' && !current.trim()))
        )
          values[field.key] = field.defaultValue;
      }
      initial.payload = { ...initial.payload, values };
      initial[defaultsKey] = 1;
    }
    if (modernOven && !initial.payload.ovenSettingsVersion)
      initial.payload = D.prepareOvenPayload(initial.payload, baseline);
    return initial;
  });
  const [attempted, setAttempted] = useState(false);
  const [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [errors, setErrors] = useState<string[]>([]),
    [persistError, setPersistError] = useState(false);
  const groups = D.fieldGroups(station.id, round.snapshot, order),
    fields = D.fieldsFor(station.id, round.snapshot, order);
  const warnings = D.observations(station.id, data.payload, order, round.snapshot);
  const entryFields = fields.filter((f: any) => f.required && f.capture !== 'on-change');
  const readyFields = entryFields.filter((f: any) =>
    D.fieldComplete(f, data.payload.values[f.key], data.payload),
  );
  function continueEntry() {
    const next = entryFields.find(
      (f: any) => !D.fieldComplete(f, data.payload.values[f.key], data.payload),
    );
    if (!next) return validate();
    if (modernOven) setActiveOven(next.key.split('_')[0]);
    if (tower) {
      const index = groups.findIndex((g: any) => g.fields.some((f: any) => f.key === next.key));
      if (index >= 0) setActiveTower(D.TOWER_STEPS[index].id);
    }
    requestAnimationFrame(() => {
      const target =
        data.payload.values[next.key] === 'NA'
          ? document.getElementById('explain-' + next.key)
          : document.getElementById('field-' + next.key);
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target?.focus({ preventScroll: true });
    });
  }
  const ovenBaseChanged =
    modernOven && data.payload.ovenSettingsVersion !== JSON.stringify(baseline);
  const baseChanged = data.baseVersion !== (existing?.version || 0);
  useEffect(() => {
    setPersistError(!writeLocal(key, data));
  }, [key, data]);
  function value(k: string, v: any) {
    setData((d: any) => ({
      ...d,
      payload: { ...d.payload, values: { ...d.payload.values, [k]: v } },
    }));
    setErrors([]);
  }
  function setting(b: string, k: string, v: string) {
    setData((d: any) => ({
      ...d,
      payload: {
        ...d.payload,
        ovenChanges: { ...d.payload.ovenChanges, [b]: { ...d.payload.ovenChanges?.[b], [k]: v } },
        values: { ...d.payload.values, [b + (k === 'sv' ? '_burner0' : '_burner2')]: v },
      },
    }));
    setErrors([]);
  }
  function resetSetting(b: string) {
    setData((d: any) => {
      const changes = { ...d.payload.ovenChanges };
      delete changes[b];
      return {
        ...d,
        payload: {
          ...d.payload,
          ovenChanges: changes,
          values: {
            ...d.payload.values,
            [b + '_burner0']: baseline[b].sv,
            [b + '_burner2']: baseline[b].time,
          },
        },
      };
    });
  }
  function toggleClosedOven(b: string) {
    const payload = data.payload;
    const closed = D.isOvenClosed(payload, b);
    const values = { ...payload.values };
    const explanations = { ...payload.fieldExplanations };
    if (!closed)
      ovenReadings.current[b] = { values: { ...values }, explanations: { ...explanations } };
    for (const suffix of ['burner1', 'biscuit', 'temp']) {
      const key = b + '_' + suffix;
      values[key] = closed ? (ovenReadings.current[b]?.values[key] ?? '') : 'NA';
      delete explanations[key];
      if (closed && ovenReadings.current[b]?.explanations[key])
        explanations[key] = ovenReadings.current[b].explanations[key];
    }
    setData({
      ...data,
      payload: {
        ...payload,
        values,
        fieldExplanations: explanations,
        closedOvens: closed
          ? payload.closedOvens.filter((id: string) => id !== b)
          : [...(payload.closedOvens || []), b],
      },
    });
    setErrors([]);
  }
  function top(k: string, v: string) {
    setData((d: any) => ({ ...d, payload: { ...d.payload, [k]: v } }));
    setErrors([]);
  }
  function explanation(k: string, v: string) {
    setData((d: any) => ({
      ...d,
      payload: { ...d.payload, fieldExplanations: { ...d.payload.fieldExplanations, [k]: v } },
    }));
    setErrors([]);
  }
  function validate() {
    setAttempted(true);
    const es = D.validatePayload(station.id, data.payload, round.snapshot, order);
    if (existing && !data.reason.trim()) es.push('กรุณาระบุเหตุผลการแก้ไข');
    if (ovenBaseChanged)
      es.push('SV หรือเวลาอบเปลี่ยนจากเครื่องอื่น กรุณาตรวจและใช้ค่าตั้งล่าสุดก่อนส่ง');
    if (baseChanged) es.push('มีข้อมูลใหม่จากเครื่องอื่น ตรวจทานร่างนี้แล้วกดใช้เวอร์ชันล่าสุด');
    setErrors(es);
    if (es.length && tower) {
      const missing = D.towerProgress(data.payload, round.snapshot, order).find(
        (p: any) => !p.complete,
      );
      if (missing) setActiveTower(missing.id);
      document.querySelector('.form-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (es.length && modernOven) {
      const missing = D.OVENS.find((b: string) =>
        ['burner1', 'biscuit', 'temp'].some((k) => {
          const key = b + '_' + k,
            f = fields.find((f: any) => f.key === key);
          return !D.fieldComplete(f, data.payload.values[key], data.payload);
        }),
      );
      if (missing) setActiveOven(missing);
      document.querySelector('.form-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (!es.length) {
      setReview(true);
      document.querySelector('.form-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
  async function submit() {
    if (warnings.length && !data.payload.confirmation?.trim()) {
      setErrors(['กรุณาระบุคำยืนยันข้อสังเกต']);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(
        {
          roundId: round.id,
          orderId: order.id,
          stationId: station.id,
          payload: data.payload,
          expectedVersion: data.baseVersion,
          reason: data.reason,
          requestId: D.uuid(),
        },
        key,
        pending?.id,
      );
      onClose();
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'ส่งไม่สำเร็จ']);
    } finally {
      setBusy(false);
    }
  }
  const orderFields =
    station.id === 'packing'
      ? [
          ['pack', 'PACK'],
          ['warehouse', 'เข้าโกดัง'],
          ['defect', 'defect'],
        ]
      : [];
  const steps = tower ? D.TOWER_STEPS : D.OVENS.map((id: string) => ({ id, name: 'เตา ' + id })),
    stepIndex = steps.findIndex((s: any) => s.id === (tower ? activeTower : activeOven));
  function goStep(index: number) {
    const step = steps[index];
    if (!step) return;
    if (tower) setActiveTower(step.id);
    else setActiveOven(step.id);
    const field = tower
      ? D.fieldGroups('crates', round.snapshot, order)[index].fields[0].key
      : step.id + '_burner1';
    requestAnimationFrame(() =>
      document.getElementById('field-' + field)?.focus({ preventScroll: true }),
    );
  }
  const context = (
    <div className="form-context">
      <div>
        <span>โรงงาน / กะ</span>
        <strong>
          {round.factory || round.snapshot.factory} · {round.shift}
        </strong>
      </div>
      <div>
        <span>ลูกค้า / SO ผลิต</span>
        {round.snapshot.orders.length > 1 ? (
          <select
            aria-label="ลูกค้า/SO ที่กำลังบันทึก"
            value={order.id}
            onChange={(e) => onOrderChange(e.target.value)}
          >
            {round.snapshot.orders.map((o: any) => (
              <option key={o.id} value={o.id}>
                {o.customer} / {o.so}
              </option>
            ))}
          </select>
        ) : (
          <strong>
            {order.customer} / {order.so}
          </strong>
        )}
      </div>
      <div>
        <span>วันที่ / กะ</span>
        <strong>
          {D.displayDate(round.date)} · {round.shift}
        </strong>
      </div>
      <div>
        <span>รอบเวลา</span>
        <strong>
          {round.start}–{round.end} · {round.line}
        </strong>
      </div>
    </div>
  );
  return (
    <dialog
      ref={dialog}
      className={'form-overlay ' + (compactForm ? 'oven-form' : '')}
      data-qa-station={station.id}
      aria-label={'บันทึก ' + station.name}
    >
      <header className="form-header">
        <button className="icon-button" aria-label="กลับ" onClick={onClose}>
          <Icon name="back" />
        </button>
        <span className="qa-header-icon">
          <Icon name={station.icon} size={23} />
        </span>
        <div>
          <strong>{station.name}</strong>
          <span>บันทึกประจำจุด</span>
        </div>
        <Badge
          tone={demo ? 'neutral' : navigator.onLine ? 'green' : 'amber'}
          icon={demo ? 'flask' : navigator.onLine ? 'wifi' : 'offline'}
        >
          {demo ? 'สาธิต' : navigator.onLine ? 'ออนไลน์' : 'ออฟไลน์'}
        </Badge>
      </header>
      <div className="form-scroll">
        {compactForm ? (
          <details className="oven-context">
            <summary>
              <strong>
                {round.factory || round.snapshot.factory} · {round.shift}
              </strong>
              <span>
                {D.displayDate(round.date)} · {round.start}–{round.end}
              </span>
              <Icon name="down" size={16} />
            </summary>
            {context}
          </details>
        ) : (
          context
        )}
        {!review && onBackfill ? (
          <Button
            variant="outline small"
            icon="history"
            className="backfill-form-button"
            onClick={onBackfill}
          >
            {compactForm ? 'กรอกย้อนหลัง' : 'เลือกวันที่ / รอบ เพื่อกรอกย้อนหลัง'}
          </Button>
        ) : null}
        <div className="form-title">
          <span className="qa-station-eyebrow">QA · {station.name}</span>
          <h1>
            {review
              ? 'ตรวจทานก่อนส่ง'
              : 'บันทึก' + (station.id === 'quality' ? 'ผลคุณภาพ' : station.name)}
          </h1>
          <p>
            {review
              ? 'ตรวจค่าที่บันทึกและยืนยันผู้กรอก'
              : modernOven
                ? 'กรอก 3 ค่าต่อเตา · SV และเวลาอบแก้เฉพาะเมื่อเปลี่ยน'
                : tower
                  ? 'เลือกทีละจุด · กรอกจำนวนเก๊ะตามที่ตรวจพบ'
                  : 'กรอกค่าของรอบนี้ ช่องว่างยังไม่นับเป็น 0'}
          </p>
        </div>
        {!review ? (
          <EntryGuide
            stationId={station.id}
            complete={readyFields.length}
            total={entryFields.length}
            onContinue={continueEntry}
            closedCount={data.payload.closedOvens?.length || 0}
          />
        ) : null}
        {Date.parse(round.endAt) <= Date.now() ? (
          <Notice tone="neutral" icon="history">
            กำลังกรอกย้อนหลัง · {D.displayDate(round.date)} · {round.start}–{round.end}
            <p>บันทึกชื่อผู้กรอกและเวลาที่ส่งจริงไว้ตรวจสอบ</p>
          </Notice>
        ) : null}
        {demo && !compactForm ? (
          <Notice tone="neutral" icon="flask">
            โหมดสาธิต · ข้อมูลนี้ไม่เข้าสู่ฐานข้อมูลจริง
          </Notice>
        ) : null}
        {persistError ? (
          <Notice>
            พื้นที่เก็บข้อมูลบนเครื่องไม่พร้อม กรุณาเปิดใช้พื้นที่จัดเก็บก่อนบันทึกออฟไลน์
          </Notice>
        ) : null}
        {ovenBaseChanged ? (
          <Notice>
            SV / เวลาอบยางมีการเปลี่ยนแปลงจากเครื่องอื่น
            <Button
              variant="outline small"
              onClick={() => {
                setData({ ...data, payload: D.prepareOvenPayload(data.payload, baseline) });
                setErrors([]);
              }}
            >
              ตรวจทานแล้ว ใช้ค่าตั้งล่าสุด
            </Button>
            <p>ค่าที่วัดจริงยังอยู่ ตรวจ SV และเวลาอบก่อนส่ง</p>
          </Notice>
        ) : null}
        {baseChanged ? (
          <Notice>
            ร่างนี้เริ่มจากเวอร์ชัน {data.baseVersion} ขณะนี้เซิร์ฟเวอร์เป็นเวอร์ชัน{' '}
            {existing?.version || 0}
            <Button
              variant="small outline"
              onClick={() => setData({ ...data, baseVersion: existing?.version || 0 })}
            >
              ตรวจทานแล้ว ใช้เวอร์ชันล่าสุด
            </Button>
          </Notice>
        ) : null}
        {station.id === 'oven' &&
        !modernOven &&
        round.snapshot.burnerFields[2]?.format === 'duration-mmss' ? (
          <Notice tone="neutral" icon="clock">
            เวลาอบยาง: กรอกแบบนาที.วินาที เช่น 6.15 = 6 นาที 15 วินาที
            <p>ช่องวินาทีใช้ 00–59 เช่น 6.05 = 6 นาที 5 วินาที</p>
          </Notice>
        ) : null}
        {station.id === 'oven' && !round.snapshot.unitConfirmed ? (
          <Notice>
            หน่วย Burner / Biscuit ยังไม่ยืนยัน ·{' '}
            {demo ? 'ทดลองกรอกได้เฉพาะโหมดสาธิต' : 'โปรดให้หัวหน้ายืนยันก่อนเปิดรอบใหม่'}
          </Notice>
        ) : null}
        {errors.length ? (
          <div className="notice red" role="alert">
            <Icon name="alert" />
            <div>
              {errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          </div>
        ) : null}
        {review ? (
          <section className="review-list">
            {groups.map((g: any) => (
              <div key={g.title} className="review-group">
                <h3>{g.title}</h3>
                {station.id === 'oven' &&
                D.isOvenClosed(data.payload, g.fields[0]?.key.split('_')[0]) ? (
                  <div className="review-row">
                    <strong>เตาปิด</strong>
                    <span>ไม่บันทึกค่าตรวจในรอบนี้</span>
                  </div>
                ) : (
                  g.fields.map((f: any) => (
                    <div className="review-row" key={f.key}>
                      <span>{f.label}</span>
                      <strong>{D.formatFieldValue(f, data.payload.values[f.key])}</strong>
                    </div>
                  ))
                )}
              </div>
            ))}
            {fields
              .filter(
                (f: any) =>
                  D.isMissingNumber(data.payload.values[f.key]) &&
                  data.payload.fieldExplanations?.[f.key]?.trim(),
              )
              .map((f: any) => (
                <div className="review-row review-explanation" key={'reason-' + f.key}>
                  <span>{f.label} · คำอธิบาย</span>
                  <strong>{data.payload.fieldExplanations[f.key]}</strong>
                </div>
              ))}
            {orderFields.map(([prefix, label]) => (
              <div className="review-row" key={prefix}>
                <span>{label} ลูกค้า/SO</span>
                <strong>
                  {data.payload[prefix + 'Customer']} / {data.payload[prefix + 'So']}
                </strong>
              </div>
            ))}
            {station.id === 'crates' ? (
              <>
                <div className="review-row">
                  <span>หมายเลขเก๊ะซ่อม</span>
                  <strong>{data.payload.repairNo || '—'}</strong>
                </div>
              </>
            ) : null}
            {data.payload.notes ? (
              <p className="review-note">หมายเหตุ: {data.payload.notes}</p>
            ) : null}
          </section>
        ) : (
          <>
            {orderFields.map(([prefix, label]) => (
              <section className="field-section" key={prefix}>
                <h3>ลูกค้า / SO · {label}</h3>
                <div className="two-col">
                  <label className="input-label">
                    ลูกค้า
                    <input
                      value={data.payload[prefix + 'Customer'] || ''}
                      onChange={(e) => top(prefix + 'Customer', e.target.value)}
                      maxLength={100}
                    />
                  </label>
                  <label className="input-label">
                    SO
                    <input
                      value={data.payload[prefix + 'So'] || ''}
                      onChange={(e) => top(prefix + 'So', e.target.value)}
                      maxLength={100}
                    />
                  </label>
                </div>
              </section>
            ))}
            {modernOven ? (
              <OvenEntry
                payload={data.payload}
                config={round.snapshot}
                order={order}
                attempted={attempted}
                onExplanation={explanation}
                baseline={baseline}
                onValue={value}
                onSetting={setting}
                onReset={resetSetting}
                active={activeOven}
                onActive={setActiveOven}
                onToggleClosed={toggleClosedOven}
              />
            ) : tower ? (
              <TowerEntry
                payload={data.payload}
                config={round.snapshot}
                order={order}
                attempted={attempted}
                onExplanation={explanation}
                onValue={value}
                onTop={top}
                active={activeTower}
                onActive={setActiveTower}
              />
            ) : (
              <>
                {groups.map((g: any) => (
                  <section className="field-section" key={g.title}>
                    {station.id !== 'quality' ? <h3>{g.title}</h3> : null}
                    <div className={station.id === 'quality' ? 'quality-fields' : 'numeric-grid'}>
                      {g.fields.map((original: any) => {
                        const f = fields.find((x: any) => x.key === original.key),
                          v = data.payload.values[f.key] ?? '',
                          num = D.asNumber(v),
                          bad = Boolean(D.fieldRangeIssue(f, v));
                        return (
                          <div
                            key={f.key}
                            className={'numeric-field ' + (bad ? 'invalid' : '')}
                            data-entry-state={
                              v === 'NA' ? 'na' : D.isMissingNumber(v) ? 'empty' : 'filled'
                            }
                          >
                            <div className="field-top">
                              <label htmlFor={'field-' + f.key}>
                                {f.label}
                                {f.required ? (
                                  <span className="required-dot" title="จำเป็น">
                                    *
                                  </span>
                                ) : null}
                              </label>
                              <span>
                                {station.id === 'quality'
                                  ? f.spec
                                    ? 'สเปก ' + f.spec.join('–')
                                    : 'ไม่มีเกณฑ์สเปก'
                                  : f.unit}
                              </span>
                            </div>
                            <div className="numeric-input-wrap">
                              <input
                                id={'field-' + f.key}
                                type="text"
                                inputMode={f.integer ? 'numeric' : 'decimal'}
                                pattern={f.integer ? '[0-9]*' : undefined}
                                autoComplete="off"
                                placeholder={f.format === 'duration-mmss' ? '6.15' : 'กรอกค่า'}
                                value={v === 'NA' ? '' : v}
                                disabled={v === 'NA'}
                                onChange={(e) => value(f.key, e.target.value)}
                                aria-invalid={Boolean(bad)}
                              />
                              {station.id !== 'quality' ? (
                                <span>{f.format === 'duration-mmss' ? 'นาที.วิ' : f.unit}</span>
                              ) : null}
                            </div>
                            <div className="field-bottom">
                              <label className="checkbox">
                                <input
                                  type="checkbox"
                                  checked={v === 'NA'}
                                  onChange={(e) => value(f.key, e.target.checked ? 'NA' : '')}
                                />
                                ไม่เกี่ยวข้อง
                              </label>
                              {bad ? <span className="error-text">นอกสเปก · บันทึกได้</span> : null}
                            </div>
                            <FieldAssist
                              field={f}
                              value={v}
                              payload={data.payload}
                              onExplanation={explanation}
                              attempted={attempted}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </>
            )}
            <label className="input-label notes-label">
              หมายเหตุ
              <textarea
                value={data.payload.notes}
                onChange={(e) => top('notes', e.target.value)}
                placeholder="ระบุสาเหตุหรือข้อสังเกตที่ตรวจพบ (ถ้ามี)"
                maxLength={1000}
                rows={3}
              />
              <span className="char-count">{(data.payload.notes || '').length}/1,000</span>
            </label>
            <label className="input-label">
              ปฏิบัติงานแทนใคร (ถ้ามี)
              <input
                value={data.payload.replacementFor || ''}
                onChange={(e) => top('replacementFor', e.target.value)}
                placeholder="ชื่อผู้ที่มาปฏิบัติงานแทน"
                maxLength={100}
              />
            </label>
            {existing ? (
              <label className="input-label">
                เหตุผลการแก้ไข <span className="required-dot">*</span>
                <textarea
                  value={data.reason}
                  onChange={(e) => setData({ ...data, reason: e.target.value })}
                  placeholder="ระบุเหตุผล เพื่อเก็บในประวัติ"
                  rows={2}
                  maxLength={500}
                />
              </label>
            ) : null}
          </>
        )}
        {warnings.length ? (
          <Notice>
            {warnings.map((w: string) => (
              <p key={w}>{w}</p>
            ))}
            {review ? (
              <label className="input-label">
                ยืนยันข้อสังเกต / เหตุผล
                <input
                  value={data.payload.confirmation || ''}
                  onChange={(e) => top('confirmation', e.target.value)}
                  placeholder="เช่น ตรวจนับซ้ำแล้ว ค่าตามที่พบจริง"
                  maxLength={500}
                />
              </label>
            ) : null}
          </Notice>
        ) : null}
        <div className="operator-card">
          <span className="icon-square">
            <Icon name="user" />
          </span>
          <div>
            <span>
              {user.accountType === 'station' ? 'บันทึกด้วยบัญชีประจำจุด' : 'ผู้บันทึกข้อมูลจริง'}
            </span>
            <strong>
              {user.name}
              {data.payload.replacementFor ? ' (แทน ' + data.payload.replacementFor + ')' : ''}
            </strong>
          </div>
          <Badge tone="green" icon="shield">
            {user.accountType === 'station' ? 'บัญชีประจำจุด' : 'บัญชีพนักงาน'}
          </Badge>
        </div>
      </div>
      <footer className="form-footer">
        {review ? (
          <>
            <Button
              variant="outline"
              onClick={() => {
                setReview(false);
                setErrors([]);
              }}
            >
              กลับไปแก้ไข
            </Button>
            <Button icon="send" busy={busy} onClick={submit}>
              ยืนยันส่งข้อมูล
            </Button>
          </>
        ) : (
          <>
            <Button
              icon="checks"
              className={'full ' + (compactForm ? 'oven-desktop-review' : '')}
              onClick={validate}
            >
              ตรวจทานและส่ง
            </Button>
            {compactForm ? (
              <div className="oven-mobile-footer">
                <Button
                  variant="outline"
                  icon="back"
                  aria-label={tower ? 'จุดก่อนหน้า' : 'เตาก่อนหน้า'}
                  disabled={stepIndex === 0}
                  onClick={() => goStep(stepIndex - 1)}
                />
                <Button
                  variant={stepIndex === steps.length - 1 ? '' : 'outline'}
                  onClick={validate}
                >
                  ตรวจทานและส่ง
                </Button>
                {stepIndex < steps.length - 1 ? (
                  <Button onClick={() => goStep(stepIndex + 1)}>
                    {steps[stepIndex + 1].name}
                    <Icon name="right" size={16} />
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
        <small>
          บันทึกแบบร่างบนเครื่อง · {review ? 'ยืนยันแล้วจึงส่งเข้าส่วนกลาง' : 'กดส่งเมื่อกรอกครบ'}
        </small>
      </footer>
    </dialog>
  );
}
