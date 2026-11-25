import { useState } from 'react';
import * as domain from '../../shared/domain.mjs';
import Select from '../../shared/ui/Select';
import { Button, Icon, Notice } from '../../shared/ui/ui';
const D: any = domain;
export default function LimitsSettings({ config, onChange, onSave, busy }: any) {
  const [orderId, setOrder] = useState(config.orders[0]?.id),
    [station, setStation] = useState('oven');
  const order = config.orders.find((o: any) => o.id === orderId) || config.orders[0];
  function limit(key: string, side: string, value: string) {
    const next = structuredClone(config),
      target = next.orders.find((o: any) => o.id === order.id);
    target.limits = {
      ...target.limits,
      [station]: {
        ...target.limits?.[station],
        [key]: { ...target.limits?.[station]?.[key], [side]: value },
      },
    };
    onChange(next);
  }
  return (
    <div className="settings-content">
      <section className="panel">
        <h2>ตรวจความครบถ้วนและ Alarm</h2>
        <Notice tone="neutral" icon="shield">
          ระบบตรวจตามกฎ · ยังไม่เชื่อม AI
          <p>เกณฑ์จะบันทึกไว้กับรอบที่เปิดใหม่ รายงานเดิมใช้เกณฑ์เดิม</p>
        </Notice>
        <label className="checkbox rules-checkbox">
          <input
            type="checkbox"
            checked={Boolean(config.reviewRules?.requireExplanation)}
            onChange={(e) =>
              onChange({
                ...config,
                reviewRules: { ...config.reviewRules, requireExplanation: e.target.checked },
              })
            }
          />
          เมื่อช่องจำเป็นไม่มีตัวเลข ต้องระบุคำอธิบายก่อนส่ง
        </label>
        <p className="muted">
          0 เป็นค่าตัวเลขจริง ช่องว่างและ “ไม่เกี่ยวข้อง” ต้องอธิบายเมื่อเปิดกฎนี้
        </p>
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>เกณฑ์ Min–Max</h2>
            <p className="muted">
              เว้นเกณฑ์ที่ยังไม่กำหนดได้ ค่าเท่ากับ Min หรือ Max ถือว่าอยู่ในช่วง
            </p>
          </div>
          <Icon name="alert" />
        </div>
        <div className="limits-selectors">
          <label className="input-label">
            ลูกค้า / SO
            <Select
              label="ลูกค้า / SO สำหรับเกณฑ์"
              value={order.id}
              onValueChange={setOrder}
              options={config.orders.map((o: any) => ({
                value: o.id,
                label: o.customer + ' / ' + o.so,
              }))}
            />
          </label>
          <label className="input-label">
            จุดตรวจ
            <Select
              label="จุดตรวจสำหรับเกณฑ์"
              value={station}
              onValueChange={setStation}
              options={D.STATIONS.map((s: any) => ({ value: s.id, label: s.name }))}
            />
          </label>
        </div>
        {station === 'quality' ? (
          <Notice tone="neutral">
            PO / PRI / MV ใช้ Min–Max จากสเปกในแท็บ “แผนผลิตและสเปก”
            <p>PRI ที่ไม่มีสเปกจะไม่มีการตัดสินเกินเกณฑ์</p>
          </Notice>
        ) : null}
        <div className="limits-fields">
          {D.fieldGroups(station, config, order).map((group: any) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              {group.fields.map((f: any) => {
                const stored =
                  station === 'quality'
                    ? order.specs[f.key]
                      ? { min: order.specs[f.key][0], max: order.specs[f.key][1] }
                      : {}
                    : order.limits?.[station]?.[f.key] || {};
                return (
                  <div className="limit-setting-row" key={f.key}>
                    <div>
                      <strong>{f.label}</strong>
                      <small>
                        {f.unit}
                        {f.format === 'duration-mmss' ? ' · 6.15 = 6 นาที 15 วินาที' : ''}
                      </small>
                    </div>
                    {['min', 'max'].map((side) => (
                      <label className="input-label" key={side}>
                        {side === 'min' ? 'Min' : 'Max'}
                        <input
                          aria-label={side + ' ' + f.key}
                          type="text"
                          inputMode="decimal"
                          disabled={station === 'quality'}
                          placeholder="ไม่กำหนด"
                          value={stored[side] ?? ''}
                          onChange={(e) => limit(f.key, side, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </section>
      <div className="settings-save">
        <span>ใช้กับรอบใหม่ของโรงและกะที่เลือก · ค่าจริงนอกเกณฑ์ยังบันทึกได้พร้อมคำยืนยัน</span>
        <Button icon="check" busy={busy} onClick={onSave}>
          บันทึกเกณฑ์และกฎตรวจ
        </Button>
      </div>
    </div>
  );
}
