'use client';
import * as domain from '../../shared/domain.mjs';
import { Icon } from '../../shared/ui/ui';
import FieldAssist from './FieldAssist';
const D: any = domain;
type Obj = Record<string, any>;

export default function TowerEntry({
  payload,
  config,
  order,
  attempted,
  onExplanation,
  onValue,
  onTop,
  active,
  onActive,
}: any) {
  const groups = D.fieldGroups('crates', config, order),
    fields = D.fieldsFor('crates', config, order),
    progress = D.towerProgress(payload, config, order),
    done = progress.filter((p: Obj) => p.complete).length;
  return (
    <section className="oven-entry tower-entry">
      <div className="oven-entry-heading">
        <strong>จำนวนเก๊ะในรอบนี้</strong>
        <span>ครบ {done}/6 จุด</span>
      </div>
      <div className="oven-tabs tower-tabs" role="tablist" aria-label="เลือกจุดหอโรย">
        {D.TOWER_STEPS.map((step: Obj, index: number) => (
          <button
            type="button"
            role="tab"
            id={'tower-tab-' + step.id}
            key={step.id}
            aria-selected={active === step.id}
            aria-controls={'tower-panel-' + step.id}
            tabIndex={active === step.id ? 0 : -1}
            className={
              (active === step.id ? 'active ' : '') + (progress[index].complete ? 'complete' : '')
            }
            onClick={() => onActive(step.id)}
            onKeyDown={(e) => {
              if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
                e.preventDefault();
                const target =
                  e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? 5
                      : (index + (e.key === 'ArrowRight' ? 1 : 5)) % 6;
                onActive(D.TOWER_STEPS[target].id);
                document.getElementById('tower-tab-' + D.TOWER_STEPS[target].id)?.focus();
              }
            }}
          >
            <span>{step.name}</span>
            <small>
              {progress[index].complete ? (
                <Icon name="check" size={14} />
              ) : (
                progress[index].filled + '/' + progress[index].total
              )}
            </small>
          </button>
        ))}
      </div>
      <div className="oven-entry-grid">
        {D.TOWER_STEPS.map((step: Obj, index: number) => (
          <section
            id={'tower-panel-' + step.id}
            role="tabpanel"
            aria-labelledby={'tower-tab-' + step.id}
            key={step.id}
            className={'oven-card tower-card ' + (active === step.id ? 'is-active' : '')}
          >
            <header className="oven-card-heading">
              <span className="oven-letter">
                {step.id.length === 1 ? (
                  step.id
                ) : (
                  <Icon name={step.id === 'machine' ? 'box' : 'settings'} size={21} />
                )}
              </span>
              <div>
                <h2>{step.name}</h2>
                <p>
                  {step.id === 'service'
                    ? 'จำนวนที่ทำในรอบ 30 นาที'
                    : step.id === 'machine'
                      ? 'จำนวนเก๊ะจากฝ่ายจักร'
                      : 'จำนวนเก๊ะ ณ จุดตรวจ'}
                </p>
              </div>
              {progress[index].complete ? (
                <span className="tower-complete">
                  <Icon name="check" size={16} />
                </span>
              ) : null}
            </header>
            <div className="oven-measurements tower-measurements">
              {groups[index].fields.map((source: Obj, fieldIndex: number) => {
                const f = fields.find((x: Obj) => x.key === source.key),
                  value = payload.values[f.key] ?? '',
                  invalid =
                    value !== '' &&
                    value !== 'NA' &&
                    (D.asNumber(value) === null ||
                      D.asNumber(value) < 0 ||
                      !Number.isInteger(D.asNumber(value)));
                const bad = Boolean(D.fieldRangeIssue(f, value));
                return (
                  <div
                    key={f.key}
                    data-entry-state={
                      value === 'NA' ? 'na' : D.isMissingNumber(value) ? 'empty' : 'filled'
                    }
                    className={
                      'oven-measurement ' +
                      (bad ? 'qa-limit-error ' : '') +
                      (groups[index].fields.length === 3 && fieldIndex === 0 ? 'pv-field' : '')
                    }
                  >
                    <label htmlFor={'field-' + f.key}>
                      {f.label}
                      {f.required ? <span className="required-dot">*</span> : null}
                    </label>
                    <div className="oven-number-wrap">
                      <input
                        id={'field-' + f.key}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        enterKeyHint="next"
                        placeholder="กรอกค่า"
                        value={value === 'NA' ? '' : value}
                        disabled={value === 'NA'}
                        aria-invalid={invalid || bad}
                        onChange={(e) => onValue(f.key, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const next = groups[index].fields[fieldIndex + 1]?.key;
                            if (next) document.getElementById('field-' + next)?.focus();
                            else if (index < 5) {
                              onActive(D.TOWER_STEPS[index + 1].id);
                              requestAnimationFrame(() =>
                                document
                                  .getElementById('field-' + groups[index + 1].fields[0].key)
                                  ?.focus({ preventScroll: true }),
                              );
                            }
                          }
                        }}
                      />
                      <span>เก๊ะ</span>
                    </div>
                    <label className="checkbox oven-na">
                      <input
                        type="checkbox"
                        checked={value === 'NA'}
                        onChange={(e) => onValue(f.key, e.target.checked ? 'NA' : '')}
                      />
                      ไม่เกี่ยวข้อง
                    </label>
                    <FieldAssist
                      field={f}
                      value={value}
                      payload={payload}
                      onExplanation={onExplanation}
                      attempted={attempted}
                    />
                  </div>
                );
              })}
            </div>
            {step.id === 'service' ? (
              <div className="tower-service-numbers">
                {D.asNumber(payload.values.repair) > 0 || payload.repairNo ? (
                  <label className="input-label">
                    <span>
                      หมายเลขเก๊ะที่ซ่อม <span className="required-dot">*</span>
                    </span>
                    <input
                      aria-label="หมายเลขเก๊ะที่ซ่อม"
                      value={payload.repairNo || ''}
                      onChange={(e) => onTop('repairNo', e.target.value)}
                      placeholder="ระบุหมายเลขเก๊ะ"
                      maxLength={200}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}
            <p className="tower-card-hint">
              {step.id === 'service'
                ? 'ถ้าไม่มีงานล้างหรือซ่อม ให้กรอก 0'
                : step.id === 'machine'
                  ? 'กรอกตามจำนวนที่ตรวจพบในรอบนี้'
                  : 'กรอกจำนวน ณ เวลาตรวจ แยกแต่ละตำแหน่ง'}
            </p>
          </section>
        ))}
      </div>
    </section>
  );
}
