'use client';
import { useEffect, useState } from 'react';
import { download } from '../../shared/api/client';
import * as domain from '../../shared/domain.mjs';
import { Badge, Button, Icon, Notice } from '../../shared/ui/ui';
import LimitsSettings from './LimitsSettings';
const D: any = domain;
type Obj = Record<string, any>;
export default function SettingsPage({
  state,
  demo,
  busy,
  onSave,
  onMember,
  onServerSettings,
  onToast,
}: any) {
  const [tab, setTab] = useState('plan'),
    [config, setConfig] = useState<any>(() => structuredClone(state.config)),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false),
    [station, setStation] = useState('oven');
  const [publicUrl, setPublicUrl] = useState(state.deployment?.publicUrl || '');
  const [person, setPerson] = useState<any>({
    name: '',
    email: '',
    username: '',
    password: '',
    role: 'qa',
    factories: ['AJ2', 'AJ2B'],
    stations: [],
    active: true,
  });
  useEffect(() => {
    setConfig(structuredClone(state.config));
  }, [state.configVersion]);
  function top(k: string, v: any) {
    setConfig((c: Obj) => ({ ...c, [k]: v }));
  }
  function order(i: number, k: string, v: any) {
    setConfig((c: Obj) => ({
      ...c,
      orders: c.orders.map((o: Obj, j: number) => (j === i ? { ...o, [k]: v } : o)),
    }));
  }
  function fieldRule(key: string, required: boolean) {
    setConfig((c: Obj) => ({
      ...c,
      fieldRules: {
        ...c.fieldRules,
        [station]: {
          ...c.fieldRules?.[station],
          [key]: { ...c.fieldRules?.[station]?.[key], required },
        },
      },
    }));
  }
  async function save() {
    setError('');
    setSaving(true);
    try {
      await onSave(config);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function savePerson() {
    setError('');
    setSaving(true);
    try {
      await onMember(person);
      setPerson({ name: '', email: '', role: 'qa', stations: [], active: true });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  const tabs = [
    ['plan', 'แผนผลิตและสเปก'],
    ['rules', 'ตรวจข้อมูล / Alarm'],
    ['points', 'จุดตรวจและหน่วย'],
    ['people', 'พนักงานและสิทธิ์'],
    ['connections', 'รายงานและการเชื่อมต่อ'],
  ];
  return (
    <div className="settings-layout">
      <div className="settings-tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button
            role="tab"
            aria-selected={tab === k}
            key={k}
            className={tab === k ? 'active' : ''}
            onClick={() => {
              setTab(k);
              setError('');
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? <Notice tone="red">{error}</Notice> : null}
      {tab === 'plan' ? (
        <div className="settings-content">
          <Notice tone="neutral" icon="history">
            การเปลี่ยนแผนหรือสเปกใช้กับรอบใหม่เท่านั้น รอบเก่าจะเก็บค่าที่ใช้ตอนเปิดรอบไว้
          </Notice>
          <section className="panel">
            <div className="section-heading">
              <h2>
                แผนผลิต · {config.factory} · {config.shift}
              </h2>
              <Badge>แผนเวอร์ชัน {state.configVersion}</Badge>
            </div>
            <label className="input-label">
              กะ
              <input
                value={config.shift}
                maxLength={80}
                onChange={(e) => top('shift', e.target.value)}
              />
            </label>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>เปิดรอบอัตโนมัติตามเวลากะ</h2>
              <Badge tone="green" icon="clock">
                ทุก 30 นาที
              </Badge>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={D.scheduleFor(config).enabled}
                onChange={(e) =>
                  top('schedule', { ...D.scheduleFor(config), enabled: e.target.checked })
                }
              />
              เปิดรอบอัตโนมัติ
            </label>
            <div className="two-col">
              <label className="input-label">
                เวลาเริ่มกะ
                <input
                  type="time"
                  step="1800"
                  value={D.scheduleFor(config).start}
                  onChange={(e) =>
                    top('schedule', { ...D.scheduleFor(config), start: e.target.value })
                  }
                />
              </label>
              <label className="input-label">
                เวลาเลิกกะ
                <input
                  type="time"
                  step="1800"
                  value={D.scheduleFor(config).end}
                  onChange={(e) =>
                    top('schedule', { ...D.scheduleFor(config), end: e.target.value })
                  }
                />
              </label>
            </div>
            <p className="muted">
              ใช้เวลาไทย · เปิดรอบใหม่ตามแผนที่บันทึกไว้ ค่าที่วัดจริงเริ่มว่างทุกรอบ
              กะข้ามเที่ยงคืนนับวันที่เริ่มกะ
            </p>
            <p className="muted tiny">
              ต้องยืนยันหน่วยของจุดเตาอบก่อนเริ่มใช้งาน
              หากหยุดเซิร์ฟเวอร์จะเปิดเฉพาะรอบปัจจุบันเมื่อกลับมาทำงาน
            </p>
          </section>
          {config.orders.map((o: Obj, i: number) => (
            <section className="panel order-settings" key={o.id}>
              <div className="section-heading">
                <h2>ลูกค้า / SO {config.orders.length > 1 ? i + 1 : ''}</h2>
                {config.orders.length > 1 ? (
                  <Button
                    variant="ghost small"
                    icon="trash"
                    onClick={() =>
                      top(
                        'orders',
                        config.orders.filter((x: Obj) => x.id !== o.id),
                      )
                    }
                  >
                    นำออกจากแผน
                  </Button>
                ) : null}
              </div>
              <div className="three-col">
                <label className="input-label">
                  ลูกค้า
                  <input
                    value={o.customer}
                    onChange={(e) => order(i, 'customer', e.target.value)}
                    maxLength={100}
                  />
                </label>
                <label className="input-label">
                  SO ผลิต
                  <input
                    value={o.so}
                    onChange={(e) => order(i, 'so', e.target.value)}
                    maxLength={100}
                  />
                </label>
                <label className="input-label">
                  เป้าต่อ 30 นาที (ตัน)
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={o.target}
                    onChange={(e) =>
                      order(i, 'target', e.target.value === '' ? '' : Number(e.target.value))
                    }
                  />
                </label>
              </div>
              <h3 className="settings-subhead">
                สูตรผสม{' '}
                <small>
                  รวม {o.recipe.reduce((s: number, r: Obj) => s + (Number(r.percent) || 0), 0)}%
                </small>
              </h3>
              <div className="recipe-list">
                {o.recipe.map((r: Obj, j: number) => (
                  <div className="recipe-row" key={j}>
                    <label className="input-label">
                      ส่วนผสม
                      <input
                        aria-label={'ส่วนผสม ' + (j + 1)}
                        value={r.name}
                        onChange={(e) =>
                          order(
                            i,
                            'recipe',
                            o.recipe.map((x: Obj, k: number) =>
                              k === j ? { ...x, name: e.target.value } : x,
                            ),
                          )
                        }
                        maxLength={100}
                      />
                    </label>
                    <label className="input-label">
                      สัดส่วน (%)
                      <input
                        aria-label={'สัดส่วน ' + r.name}
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        value={r.percent}
                        onChange={(e) =>
                          order(
                            i,
                            'recipe',
                            o.recipe.map((x: Obj, k: number) =>
                              k === j
                                ? {
                                    ...x,
                                    percent: e.target.value === '' ? '' : Number(e.target.value),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    {o.recipe.length > 1 ? (
                      <button
                        className="icon-button"
                        aria-label={'ลบส่วนผสม ' + r.name}
                        onClick={() =>
                          order(
                            i,
                            'recipe',
                            o.recipe.filter((_: any, k: number) => k !== j),
                          )
                        }
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              <Button
                variant="ghost small"
                icon="plus"
                onClick={() => order(i, 'recipe', [...o.recipe, { name: '', percent: 0 }])}
              >
                เพิ่มส่วนผสม
              </Button>
              <h3 className="settings-subhead">สเปกคุณภาพ</h3>
              <div className="spec-settings">
                {['po', 'pri', 'mv'].map((k) => (
                  <div className="spec-setting" key={k}>
                    <strong>{k.toUpperCase()}</strong>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={o.specs[k] === null}
                        onChange={(e) =>
                          order(i, 'specs', { ...o.specs, [k]: e.target.checked ? null : [0, 0] })
                        }
                      />
                      ไม่มีเกณฑ์สเปก
                    </label>
                    {o.specs[k] !== null ? (
                      <div className="range-inputs">
                        <input
                          aria-label={k + ' ต่ำสุด'}
                          type="number"
                          min="0"
                          step="any"
                          value={o.specs[k][0]}
                          onChange={(e) =>
                            order(i, 'specs', {
                              ...o.specs,
                              [k]: [
                                e.target.value === '' ? '' : Number(e.target.value),
                                o.specs[k][1],
                              ],
                            })
                          }
                        />
                        <span>ถึง</span>
                        <input
                          aria-label={k + ' สูงสุด'}
                          type="number"
                          min="0"
                          step="any"
                          value={o.specs[k][1]}
                          onChange={(e) =>
                            order(i, 'specs', {
                              ...o.specs,
                              [k]: [
                                o.specs[k][0],
                                e.target.value === '' ? '' : Number(e.target.value),
                              ],
                            })
                          }
                        />
                      </div>
                    ) : (
                      <p className="muted tiny">เก็บผลตรวจได้ โดยไม่ตัดสินผ่าน / ไม่ผ่าน</p>
                    )}
                  </div>
                ))}
              </div>
              <details className="burner-settings">
                <summary>ค่าตั้ง Burner แยกเตา A–D</summary>
                {['A', 'B', 'C', 'D'].map((b) => (
                  <div className="burner-setting-row" key={b}>
                    <strong>เตา {b}</strong>
                    {config.burnerFields.map((f: Obj, j: number) =>
                      config.ovenEntryMode === 'measurements-and-settings' && j === 1 ? null : (
                        <label className="input-label" key={j}>
                          {f.label} ({f.unit || 'รอยืนยันหน่วย'})
                          <input
                            type={f.format === 'duration-mmss' ? 'text' : 'number'}
                            inputMode="decimal"
                            min="0"
                            step="any"
                            placeholder={
                              f.format === 'duration-mmss' ? '6.15 = 6 นาที 15 วินาที' : undefined
                            }
                            aria-label={'ค่าตั้ง ' + b + ' ' + j}
                            value={o.burnerSet[b][j]}
                            onChange={(e) =>
                              order(i, 'burnerSet', {
                                ...o.burnerSet,
                                [b]: o.burnerSet[b].map((v: any, k: number) =>
                                  k === j
                                    ? f.format === 'duration-mmss'
                                      ? e.target.value
                                      : e.target.value === ''
                                        ? ''
                                        : Number(e.target.value)
                                    : v,
                                ),
                              })
                            }
                          />
                          {f.format === 'duration-mmss' ? (
                            <small className="muted">นาที.วินาที · วินาที 00–59</small>
                          ) : null}
                        </label>
                      ),
                    )}
                  </div>
                ))}
              </details>
            </section>
          ))}
          <Button
            variant="outline"
            icon="plus"
            onClick={() =>
              top('orders', [
                ...config.orders,
                {
                  ...structuredClone(D.DEFAULT_CONFIG.orders[0]),
                  id: D.uuid(),
                  customer: '',
                  so: '',
                  target: 0,
                },
              ])
            }
          >
            เพิ่มลูกค้า / SO ในแผน
          </Button>
          <div className="settings-save">
            <span>เป้าทั้งหมดเป็นยอดเฉพาะรอบ 30 นาที</span>
            <Button icon="check" busy={saving || busy} onClick={save}>
              บันทึกแผนผลิต
            </Button>
          </div>
        </div>
      ) : null}
      {tab === 'rules' ? (
        <LimitsSettings config={config} onChange={setConfig} onSave={save} busy={saving || busy} />
      ) : null}
      {tab === 'points' ? (
        <div className="settings-content">
          <section className="panel">
            <h2>ความหมายและหน่วยที่ใช้จริง</h2>
            <p className="muted">ยืนยันกับหน้างานก่อนเปิดรอบจริง เพื่อไม่ตีความตัวเลขผิด</p>
            {config.burnerFields.map((f: Obj, i: number) => (
              <div className="two-col unit-row" key={i}>
                <label className="input-label">
                  ชื่อค่า Burner ช่อง {i + 1}
                  <input
                    value={f.label}
                    maxLength={80}
                    onChange={(e) =>
                      top(
                        'burnerFields',
                        config.burnerFields.map((x: Obj, j: number) =>
                          j === i ? { ...x, label: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
                <label className="input-label">
                  หน่วย
                  <input
                    value={f.unit}
                    placeholder="ระบุหน่วยจริง"
                    maxLength={40}
                    onChange={(e) =>
                      top(
                        'burnerFields',
                        config.burnerFields.map((x: Obj, j: number) =>
                          j === i ? { ...x, unit: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
              </div>
            ))}
            <label className="input-label">
              หน่วยน้ำหนัก Biscuit
              <input
                value={config.biscuitUnit}
                placeholder="ระบุหน่วยที่หน้างานใช้"
                maxLength={40}
                onChange={(e) => top('biscuitUnit', e.target.value)}
              />
            </label>
            <label className="checkbox confirm-units">
              <input
                type="checkbox"
                checked={config.unitConfirmed}
                onChange={(e) => top('unitConfirmed', e.target.checked)}
              />
              ตรวจสอบชื่อและหน่วยกับหน้างานแล้ว
            </label>
          </section>
          <section className="panel">
            <h2>จุดตรวจที่ต้องส่งครบในแต่ละ SO</h2>
            <p className="muted">ระบบจะรอข้อมูลของจุดที่เลือกครบทั้งหมด ก่อนสร้างรายงาน</p>
            <div className="required-stations">
              {D.STATIONS.map((s: Obj) => (
                <div key={s.id}>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={config.requiredStations.includes(s.id)}
                      onChange={(e) =>
                        top(
                          'requiredStations',
                          e.target.checked
                            ? [...config.requiredStations, s.id]
                            : config.requiredStations.filter((v: string) => v !== s.id),
                        )
                      }
                    />
                    <Icon name={s.icon} />
                    <strong>{s.name}</strong>
                  </label>
                  <input
                    aria-label={'ผู้รับผิดชอบ ' + s.name}
                    placeholder="ชื่อผู้รับผิดชอบ (แสดงผล)"
                    value={config.assignments?.[s.id] || ''}
                    maxLength={100}
                    onChange={(e) =>
                      top('assignments', { ...config.assignments, [s.id]: e.target.value })
                    }
                  />
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>ช่องที่จำเป็นต้องกรอก</h2>
              <select
                aria-label="เลือกจุดตั้งค่าช่องกรอก"
                value={station}
                onChange={(e) => setStation(e.target.value)}
              >
                {D.STATIONS.map((s: Obj) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="muted">
              ช่องที่จำเป็นรับค่า 0 หรือ “ไม่เกี่ยวข้อง” ได้ แต่ไม่รับช่องว่าง
            </p>
            <div className="required-fields">
              {D.fieldsFor(station, config, config.orders[0]).map((f: Obj) => (
                <label className="checkbox" key={f.key}>
                  <input
                    type="checkbox"
                    disabled={f.capture === 'on-change'}
                    checked={f.required !== false}
                    onChange={(e) => fieldRule(f.key, e.target.checked)}
                  />
                  <span>
                    {f.label}
                    <small>{f.unit}</small>
                  </span>
                </label>
              ))}
            </div>
          </section>
          <div className="settings-save">
            <span>ปรับใช้กับรอบใหม่ · กำหนดสิทธิ์จริงในแท็บพนักงาน</span>
            <Button icon="check" busy={saving || busy} onClick={save}>
              บันทึกจุดตรวจ
            </Button>
          </div>
        </div>
      ) : null}
      {tab === 'people' ? (
        <div className="settings-content">
          <Notice tone="neutral" icon="shield">
            ใช้บัญชีเข้าสู่ระบบของแต่ละคน เพิ่มอีเมลและจุดที่รับผิดชอบไว้ที่นี่
            ผู้มาแทนเวรต้องใช้บัญชีตัวเองและได้รับสิทธิ์จุดนั้นด้วย
            <p>หัวหน้าสร้างชื่อผู้ใช้และรหัสผ่านให้พนักงาน ไม่ต้องมีบัญชี ChatGPT หรืออีเมล</p>
          </Notice>
          <section className="panel">
            <h2>{person.email ? 'เพิ่ม / แก้ไขสิทธิ์พนักงาน' : 'เพิ่มพนักงาน QA'}</h2>
            <div className="two-col">
              <label className="input-label">
                ชื่อพนักงาน
                <input
                  value={person.name}
                  maxLength={100}
                  onChange={(e) => setPerson({ ...person, name: e.target.value })}
                />
              </label>
              <label className="input-label">
                ชื่อผู้ใช้เข้าสู่ระบบ
                <input
                  autoComplete="off"
                  value={person.username || ''}
                  maxLength={40}
                  onChange={(e) =>
                    setPerson({
                      ...person,
                      username: e.target.value,
                      email: person.id
                        ? person.email
                        : e.target.value.trim().toLowerCase() + '@qa.local',
                    })
                  }
                />
              </label>
            </div>
            <label className="input-label">
              รหัสผ่าน {person.id ? '(เว้นว่างหากไม่เปลี่ยน)' : 'สำหรับบัญชีใหม่'}
              <input
                type="password"
                autoComplete="new-password"
                value={person.password || ''}
                maxLength={200}
                onChange={(e) => setPerson({ ...person, password: e.target.value })}
                placeholder="อย่างน้อย 8 ตัวอักษร"
              />
            </label>
            <label className="input-label">
              บทบาท
              <select
                value={person.role}
                onChange={(e) => setPerson({ ...person, role: e.target.value })}
              >
                <option value="qa">QA · เห็นและกรอกเฉพาะจุดที่รับผิดชอบ</option>
                <option value="supervisor">หัวหน้างาน · ดูทุกจุดและตั้งค่าระบบ</option>
              </select>
            </label>
            <h3 className="settings-subhead">โรงงานที่อนุญาต</h3>
            <div className="check-row">
              {D.FACTORIES.map((factory: string) => (
                <label className="checkbox" key={factory}>
                  <input
                    type="checkbox"
                    checked={(person.factories || []).includes(factory)}
                    onChange={(e) =>
                      setPerson({
                        ...person,
                        factories: e.target.checked
                          ? [...(person.factories || []), factory]
                          : (person.factories || []).filter((x: string) => x !== factory),
                      })
                    }
                  />
                  {factory}
                </label>
              ))}
            </div>
            <h3 className="settings-subhead">สิทธิ์จุดตรวจ</h3>
            <div className="check-row">
              {D.STATIONS.map((s: Obj) => (
                <label className="checkbox" key={s.id}>
                  <input
                    type="checkbox"
                    checked={person.stations.includes(s.id)}
                    onChange={(e) =>
                      setPerson({
                        ...person,
                        stations: e.target.checked
                          ? [...person.stations, s.id]
                          : person.stations.filter((x: string) => x !== s.id),
                      })
                    }
                  />
                  {s.name}
                </label>
              ))}
            </div>
            <div className="settings-inline-actions">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={person.active}
                  onChange={(e) => setPerson({ ...person, active: e.target.checked })}
                />
                เปิดใช้งานบัญชี
              </label>
              <Button busy={saving || busy} icon="user" onClick={savePerson}>
                บันทึกสิทธิ์พนักงาน
              </Button>
            </div>
          </section>
          <section className="panel">
            <h2>ผู้มีสิทธิ์ในระบบ ({state.members.length})</h2>
            {state.members.length ? (
              state.members.map((m: Obj) => (
                <button
                  className="member-row"
                  key={m.id}
                  onClick={() =>
                    setPerson({
                      ...m,
                      password: '',
                      factories: m.factories || D.FACTORIES,
                      active: Boolean(m.active),
                    })
                  }
                >
                  <span className="avatar">
                    <Icon name="user" />
                  </span>
                  <span>
                    <strong>{m.name}</strong>
                    <small>{m.username || m.email}</small>
                  </span>
                  <Badge tone={m.active ? 'green' : 'neutral'}>
                    {m.active ? (m.role === 'supervisor' ? 'หัวหน้า' : 'QA') : 'ปิดใช้งาน'}
                  </Badge>
                  <Icon name="edit" size={17} />
                </button>
              ))
            ) : (
              <p className="muted">ยังไม่ได้เพิ่มพนักงานในโหมดสาธิต</p>
            )}
          </section>
        </div>
      ) : null}
      {tab === 'connections' ? (
        <div className="settings-content">
          <section className="panel">
            <h2>เซิร์ฟเวอร์โรงงานและที่อยู่ QR</h2>
            <p className="muted">
              ข้อมูลเก็บบนคอม Windows ของโรงงาน ระบบตรวจรอบที่พร้อมทุก 30 วินาที แม้ปิดหน้าเว็บ
            </p>
            <label className="input-label">
              ที่อยู่เว็บสำหรับ QR
              <input
                type="url"
                value={publicUrl}
                onChange={(e) => setPublicUrl(e.target.value)}
                placeholder="https://qa.example.com"
              />
            </label>
            <p className="muted tiny">
              ใช้ HTTPS ที่เข้าถึงได้จากทั้งในและนอกโรงงานก่อนพิมพ์ QR ถาวร ถ้าใช้ localhost
              มือถือเครื่องอื่นจะเข้าไม่ได้
            </p>
            <Button
              variant="outline"
              icon="check"
              busy={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await onServerSettings(publicUrl);
                  onToast('บันทึก URL สำหรับ QR แล้ว');
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              บันทึกที่อยู่เว็บ
            </Button>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>รายงานทุก 30 นาที</h2>
              <Badge tone="green" icon="clock">
                รอครบทุกจุด
              </Badge>
            </div>
            <p className="muted">
              ยอดผลิตและเป้าเป็นยอดเฉพาะรอบ ไม่ใช่ยอดสะสม เมื่อจบรอบและข้อมูลครบ
              ระบบจะสร้างรายงานหนึ่งฉบับ หากแก้ไขจะเก็บฉบับใหม่
            </p>
            <div className="connection-row">
              <span className="icon-square">
                <Icon name="checks" />
              </span>
              <div>
                <h3>AI ช่วยเลือกประเด็นสำคัญ</h3>
                <p>
                  {state.integrations.ai
                    ? 'เชื่อมต่อบริการแล้ว หากเรียกไม่สำเร็จระบบจะใช้สรุปตามสูตร'
                    : 'ยังไม่เชื่อมต่อบริการ · ระบบสรุปตามสูตรยังทำงานได้'}
                </p>
              </div>
              <Badge tone={state.integrations.ai ? 'green' : 'neutral'}>
                {state.integrations.ai ? 'พร้อมเรียกใช้' : 'ยังไม่เชื่อมต่อ'}
              </Badge>
            </div>
            <div className="connection-row">
              <span className="icon-square">
                <Icon name="send" />
              </span>
              <div>
                <h3>กลุ่ม WhatsApp เดิม</h3>
                <p>รุ่นนำร่องใช้หัวหน้ากดแชร์ เลือกกลุ่มและยืนยันส่งใน WhatsApp</p>
              </div>
              <Badge>กดแชร์</Badge>
            </div>
            <Notice>การส่งเข้ากลุ่มอัตโนมัติต้องทดสอบสิทธิ์และกลุ่มจริงก่อนเปิดใช้งาน</Notice>
          </section>
          <section className="panel">
            <h2>ข้อมูลสำรอง</h2>
            <p className="muted">
              ดาวน์โหลดข้อมูลที่โหลดอยู่ในหน้านี้เป็น JSON เพื่อเก็บสำเนา
              ไม่รวมข้อมูลรอส่งบนเครื่องหรือข้อมูลเก่าที่อยู่นอกช่วงที่โหลด
            </p>
            <Button
              icon="download"
              variant="outline"
              onClick={() =>
                download(
                  'COMPOUND-QA-' + D.bangkokDate() + '.json',
                  JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2),
                  'application/json',
                )
              }
            >
              ดาวน์โหลดข้อมูล
            </Button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
