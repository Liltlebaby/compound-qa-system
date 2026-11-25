'use client';
import { useState } from 'react';
import * as domain from '../../shared/domain.mjs';
import { Button, Icon } from '../../shared/ui/ui';
import FieldAssist from './FieldAssist';
const D: any = domain;
type Obj = Record<string, any>;

export default function OvenEntry({
  payload,
  config,
  order,
  attempted,
  onExplanation,
  baseline,
  onValue,
  onSetting,
  onReset,
  active,
  onActive,
  onToggleClosed,
}: any) {
  const allFields = D.fieldsFor('oven', config, order);
  function complete(b: string) {
    return ['burner1', 'biscuit', 'temp'].every((k) =>
      D.fieldComplete(
        allFields.find((f: Obj) => f.key === b + '_' + k),
        payload.values[b + '_' + k],
        payload,
      ),
    );
  }
  function next(b: string) {
    onActive(b);
    requestAnimationFrame(() =>
      document.getElementById('field-' + b + '_burner1')?.focus({ preventScroll: true }),
    );
  }
  const count = D.OVENS.filter(complete).length;
  return (
    <section className="oven-entry">
      <div className="oven-entry-heading">
        <strong>ค่าที่ตรวจจริงในรอบนี้</strong>
        <span>
          ครบ {count}/4 เตา
          {payload.closedOvens?.length ? ' · ปิด ' + payload.closedOvens.length + ' เตา' : ''}
        </span>
      </div>
      <div className="oven-tabs" role="tablist" aria-label="เลือกเตาที่กรอก">
        {D.OVENS.map((b: string) => (
          <button
            type="button"
            role="tab"
            id={'oven-tab-' + b}
            aria-selected={active === b}
            aria-controls={'oven-panel-' + b}
            tabIndex={active === b ? 0 : -1}
            key={b}
            onClick={() => onActive(b)}
            onKeyDown={(e) => {
              if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
                e.preventDefault();
                const i = D.OVENS.indexOf(b),
                  target =
                    e.key === 'Home'
                      ? 'A'
                      : e.key === 'End'
                        ? 'D'
                        : D.OVENS[(i + (e.key === 'ArrowRight' ? 1 : 3)) % 4];
                onActive(target);
                document.getElementById('oven-tab-' + target)?.focus();
              }
            }}
            className={
              (active === b ? 'active ' : '') +
              (complete(b) ? 'complete ' : '') +
              (D.isOvenClosed(payload, b) ? 'is-closed' : '')
            }
          >
            <span>เตา {b}</span>
            <small>
              {D.isOvenClosed(payload, b) ? (
                'ปิด'
              ) : complete(b) ? (
                <Icon name="check" size={14} />
              ) : (
                ['burner1', 'biscuit', 'temp'].filter((k) => {
                  return D.fieldComplete(
                    allFields.find((f: Obj) => f.key === b + '_' + k),
                    payload.values[b + '_' + k],
                    payload,
                  );
                }).length + '/3'
              )}
            </small>
          </button>
        ))}
      </div>
      <div className="oven-entry-grid">
        {D.OVENS.map((b: string) => (
          <OvenCard
            key={b}
            burner={b}
            active={active === b}
            fieldsConfig={allFields}
            attempted={attempted}
            onExplanation={onExplanation}
            payload={payload}
            baseline={baseline[b]}
            onValue={onValue}
            onSetting={onSetting}
            onReset={onReset}
            onToggleClosed={onToggleClosed}
          />
        ))}
      </div>
      <div className="oven-step-actions">
        {active !== 'A' ? (
          <Button
            type="button"
            variant="outline"
            icon="back"
            onClick={() => next(D.OVENS[D.OVENS.indexOf(active) - 1])}
          >
            เตาก่อนหน้า
          </Button>
        ) : (
          <span>กรอก 3 ค่า แล้วไปเตาถัดไป</span>
        )}
        {active !== 'D' ? (
          <Button type="button" onClick={() => next(D.OVENS[D.OVENS.indexOf(active) + 1])}>
            ถัดไป · เตา {D.OVENS[D.OVENS.indexOf(active) + 1]}
            <Icon name="right" size={17} />
          </Button>
        ) : (
          <span className={count === 4 ? 'oven-all-done' : ''}>
            {count === 4 ? 'ครบแล้ว กดตรวจทานและส่งด้านล่าง' : 'ตรวจให้ครบทั้ง 4 เตาก่อนส่ง'}
          </span>
        )}
      </div>
    </section>
  );
}
function OvenCard({
  burner: b,
  active,
  fieldsConfig,
  attempted,
  onExplanation,
  payload,
  baseline,
  onValue,
  onSetting,
  onReset,
  onToggleClosed,
}: any) {
  const closed = D.isOvenClosed(payload, b);
  const changes = payload.ovenChanges?.[b] || {},
    [editing, setEditing] = useState(Boolean(Object.keys(changes).length));
  const sv = payload.values[b + '_burner0'],
    time = payload.values[b + '_burner2'];
  const fields = [
    { key: 'burner1', label: 'PV · อุณหภูมิจริง', unit: '°C', big: true },
    { key: 'biscuit', label: 'น้ำหนัก Biscuit', unit: 'กก.' },
    { key: 'temp', label: 'อุณหภูมิก้อนยาง', unit: '°C' },
  ];
  return (
    <section
      id={'oven-panel-' + b}
      role="tabpanel"
      aria-labelledby={'oven-tab-' + b}
      className={'oven-card ' + (active ? 'is-active ' : '') + (closed ? 'is-closed' : '')}
    >
      <header className="oven-card-heading">
        <span className="oven-letter">{b}</span>
        <div>
          <h2>เตา {b}</h2>
          <p>กรอกเฉพาะค่าที่วัดจริง</p>
        </div>
        {Object.keys(changes).length ? (
          <span className="oven-change-badge">ปรับค่าตั้ง</span>
        ) : null}
        <Button
          type="button"
          variant="outline small"
          icon="power"
          className="oven-closed-toggle"
          aria-label={'เตา ' + b + ' ปิด'}
          aria-pressed={closed}
          onClick={() => onToggleClosed(b)}
        >
          เตาปิด
        </Button>
      </header>
      {closed ? (
        <div className="oven-closed-message">
          <Icon name="power" size={25} />
          <div>
            <strong>เตา {b} ปิดในรอบนี้</strong>
            <p>ไม่ต้องกรอก PV น้ำหนัก และอุณหภูมิก้อนยาง</p>
            <small>กด “เตาปิด” อีกครั้งเพื่อกลับมากรอก · ใช้สถานะนี้เฉพาะรอบนี้</small>
          </div>
        </div>
      ) : (
        <>
          <div className="oven-current-settings">
            <div>
              <span>SV ที่ตั้ง</span>
              <strong>
                {D.formatValue(sv)} <small>°C</small>
              </strong>
            </div>
            <div>
              <span>เวลาอบยาง</span>
              <strong>{D.durationText(time)}</strong>
            </div>
          </div>
          {['burner0', 'burner2']
            .map((k) =>
              D.fieldRangeIssue(
                fieldsConfig.find((f: Obj) => f.key === b + '_' + k),
                payload.values[b + '_' + k],
              ),
            )
            .filter(Boolean)
            .map((issue: Obj) => (
              <p className="oven-setting-alert" key={issue.fieldKey}>
                {issue.message}
              </p>
            ))}
          <div className="oven-measurements">
            {fields.map((f: Obj) => {
              const key = b + '_' + f.key,
                value = payload.values[key] ?? '',
                field = fieldsConfig.find((x: Obj) => x.key === key),
                bad = Boolean(D.fieldRangeIssue(field, value));
              return (
                <div
                  key={key}
                  data-entry-state={
                    value === 'NA' ? 'na' : D.isMissingNumber(value) ? 'empty' : 'filled'
                  }
                  className={
                    'oven-measurement ' + (f.big ? 'pv-field' : '') + (bad ? ' qa-limit-error' : '')
                  }
                >
                  <label htmlFor={'field-' + key}>
                    {f.label}
                    <span className="required-dot">*</span>
                  </label>
                  <div className="oven-number-wrap">
                    <input
                      id={'field-' + key}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      enterKeyHint="next"
                      placeholder="กรอกค่า"
                      value={value === 'NA' ? '' : value}
                      disabled={value === 'NA'}
                      aria-invalid={bad}
                      onChange={(e) => onValue(key, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const i = fields.findIndex((x) => x.key === f.key),
                            next = i < 2 ? 'field-' + b + '_' + fields[i + 1].key : null;
                          if (next) document.getElementById(next)?.focus();
                          else document.getElementById('oven-tab-' + b)?.focus();
                        }
                      }}
                    />
                    <span>{f.unit}</span>
                  </div>
                  <label className="checkbox oven-na">
                    <input
                      type="checkbox"
                      checked={value === 'NA'}
                      onChange={(e) => onValue(key, e.target.checked ? 'NA' : '')}
                    />
                    ไม่เกี่ยวข้อง
                  </label>
                  <FieldAssist
                    field={field}
                    value={value}
                    payload={payload}
                    onExplanation={onExplanation}
                    attempted={attempted}
                  />
                </div>
              );
            })}
          </div>
          <details
            className="oven-setting-editor"
            open={editing}
            onToggle={(e) => setEditing(e.currentTarget.open)}
          >
            <summary>
              <Icon name="edit" size={15} />
              <span>ปรับ SV / เวลาอบยาง</span>
              <small>เฉพาะเมื่อเปลี่ยน</small>
              <Icon name="down" size={15} />
            </summary>
            <div className="oven-setting-editor-body">
              <p>ค่าที่ปรับจะใช้ในรอบนี้ และส่งต่อไปรอบถัดไปของโรง/กะและ SO เดิม</p>
              <div className="two-col">
                <label className="input-label">
                  SV ใหม่ (°C)
                  <input
                    aria-label={'SV เตา ' + b}
                    type="text"
                    inputMode="decimal"
                    value={sv}
                    onChange={(e) => onSetting(b, 'sv', e.target.value)}
                  />
                  <small>ก่อนปรับ {baseline.sv} °C</small>
                </label>
                <label className="input-label">
                  เวลาอบ (นาที.วินาที)
                  <input
                    aria-label={'เวลาอบยางเตา ' + b}
                    type="text"
                    inputMode="decimal"
                    placeholder="6.15"
                    value={time}
                    onChange={(e) => onSetting(b, 'time', e.target.value)}
                  />
                  <small>6.15 = 6 นาที 15 วินาที</small>
                </label>
              </div>
              <Button
                type="button"
                variant="ghost small"
                icon="refresh"
                onClick={() => {
                  onReset(b);
                  setEditing(false);
                }}
              >
                ใช้ค่าตั้งเดิม
              </Button>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
