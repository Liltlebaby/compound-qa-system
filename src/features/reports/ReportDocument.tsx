import type { ReactNode } from 'react';
import * as domain from '../../shared/domain.mjs';
import {
  allExplicitZero,
  qualityResult,
  reportDuration,
  reportTimestamp,
  reportValue,
  targetResult,
} from '../../shared/report-format.mjs';
import { Badge, Icon } from '../../shared/ui/ui';
const D: any = domain;
type Obj = Record<string, any>;
function Values({ items, issues = [] }: { items: [string, any, string?][]; issues?: any[] }) {
  return (
    <dl className="report-values">
      {items.map(([label, value, unit], i) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className={issues[i] ? 'report-value-red' : ''}>{reportValue(value, unit)}</dd>
        </div>
      ))}
    </dl>
  );
}
function Detail({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <details className="report-fold">
      <summary>
        <span className="report-fold-icon">
          <Icon name={icon} />
        </span>
        <span>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>
        <Icon name="down" className="report-fold-chevron" size={18} />
      </summary>
      <div className="report-fold-content">{children}</div>
    </details>
  );
}
function Author({ entry }: { entry: Obj }) {
  return (
    <p className="report-author">
      <Icon name="user" size={14} />
      <span>
        {entry.operatorName} · {reportTimestamp(entry.submittedAt)}
      </span>
    </p>
  );
}
export default function ReportDocument({ round, report }: { round: Obj; report: Obj }) {
  if (!report.facts?.length)
    return (
      <div className="readable-report">
        <p className="report-caption">รายงานฉบับเดิม</p>
        <pre className="report-legacy">{report.text}</pre>
      </div>
    );
  return (
    <div className="readable-report">
      <header className="report-cover">
        <h2>
          รอบ {round.start}–{round.end}
          <small>น.</small>
        </h2>
        <p>
          {D.displayDate(round.date)} · {round.shift} · {round.line}
        </p>
        <span className="report-caption">ข้อมูลครบ {reportTimestamp(report.completedAt)}</span>
      </header>
      {report.changes ? (
        <div className="report-revision-note">
          <Icon name="history" size={18} />
          <div>
            <strong>ฉบับแก้ไข {report.revision}</strong>
            <p>{report.changes}</p>
          </div>
        </div>
      ) : null}
      {report.facts.map((fact: Obj) => {
        const { order, entries } = fact,
          oven = entries.oven?.payload,
          tower = entries.crates?.payload,
          packing = entries.packing?.payload,
          prod = entries.production?.payload,
          zero = prod && allExplicitZero(D.DEFECTS.map(([k]: string[]) => prod.values[k]));
        return (
          <article className="report-order" key={order.id}>
            <section className="report-output" aria-label="สรุปผลผลิต">
              <div className="report-order-heading">
                <div>
                  <span className="report-caption">ลูกค้า / SO ผลิต</span>
                  <h3>
                    {order.customer} <span>/ {order.so}</span>
                  </h3>
                </div>
              </div>
              <div className="report-output-main">
                <span>ผลผลิต PB</span>
                <strong
                  className={
                    D.fieldRangeIssue(
                      D.fieldsFor('production', round.snapshot, order).find(
                        (f: Obj) => f.key === 'pb',
                      ),
                      prod?.values.pb,
                    )
                      ? 'report-value-red'
                      : ''
                  }
                >
                  {fact.actual === null ? reportValue(prod?.values.pb) : D.numberText(fact.actual)}
                  <small>{fact.actual === null ? '' : 'ตัน'}</small>
                </strong>
                <span>เป้ารอบนี้ {D.numberText(order.target)} ตัน</span>
              </div>
              <div className="report-output-percent">
                <strong>
                  {D.numberText(fact.percentage)}
                  <small>{fact.percentage === null ? '' : '%'}</small>
                </strong>
                <span>เทียบเป้ารอบนี้</span>
              </div>
              <div className="report-output-bottom">
                <div className="report-output-track">
                  <span style={{ width: Math.max(0, Math.min(100, fact.percentage || 0)) + '%' }} />
                </div>
                <p>{targetResult(fact)}</p>
              </div>
            </section>
            {order.recipe?.length ? (
              <p className="report-recipe">
                สูตรผสม{' '}
                <strong>
                  {order.recipe.map((r: Obj) => r.name + ' ' + r.percent + '%').join(' + ')}
                </strong>
              </p>
            ) : null}
            {fact.observations?.length ? (
              <section
                className={
                  'report-observations ' +
                  (Object.values(fact.checks || {}).some((c: any) =>
                    c.issues?.some((i: Obj) => i.severity === 'critical'),
                  )
                    ? 'report-critical'
                    : '')
                }
                aria-label="ข้อสังเกต"
              >
                <h4>
                  <Icon name="alert" size={18} />
                  ข้อสังเกต {fact.observations.length} รายการ
                </h4>
                <ul>
                  {fact.observations.map((w: string) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {entries.quality ? (
              <section className="report-quality-section report-quality-band">
                <h4>
                  <Icon name="flask" size={26} />
                  ผลคุณภาพ
                </h4>
                <div className="report-quality">
                  {['po', 'pri', 'mv'].map((k) => {
                    const v = entries.quality.payload.values[k],
                      q = qualityResult(v, order.specs?.[k]);
                    return (
                      <div key={k} className={'report-quality-item ' + q.tone}>
                        <div className="report-quality-reading">
                          <span>{k.toUpperCase()}</span>
                          <strong className={q.bad ? 'report-value-red' : ''}>
                            {reportValue(v)}
                          </strong>
                        </div>
                        <Badge
                          tone={q.tone}
                          icon={q.bad ? 'alert' : q.tone === 'green' ? 'check' : 'minus'}
                        >
                          {q.label}
                          {q.range ? ' ' + q.range : ''}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
                <details className="report-quality-author">
                  <summary>ผู้ตรวจและเวลาบันทึก</summary>
                  <Author entry={entries.quality} />
                </details>
              </section>
            ) : null}
            {Object.entries(fact.checks || {}).some(([, check]: any) =>
              check.issues?.some((i: Obj) => i.kind === 'missing'),
            ) ? (
              <details className="report-qa-notes report-missing-values">
                <summary>ข้อมูลที่ไม่มีตัวเลขและคำอธิบาย</summary>
                {Object.entries(fact.checks).flatMap(([station, check]: any) =>
                  check.issues
                    .filter((i: Obj) => i.kind === 'missing')
                    .map((issue: Obj) => (
                      <div key={station + issue.fieldKey}>
                        <strong>
                          {D.STATIONS.find((s: Obj) => s.id === station)?.name} · {issue.label}
                        </strong>
                        <p>{issue.reason || 'ยังไม่มีคำอธิบาย'}</p>
                      </div>
                    )),
                )}
              </details>
            ) : null}
            <div className="report-detail-heading">
              <h4>รายละเอียดจุดตรวจ</h4>
              <span>แตะเพื่อเปิดดู</span>
            </div>
            {oven ? (
              <Detail
                title="เตาอบ"
                subtitle={
                  oven.closedOvens?.length
                    ? 'เตาปิด: ' + oven.closedOvens.join(', ') + ' · กดดูค่าของเตาที่ใช้งาน'
                    : 'SV · PV · เวลาอบ · Biscuit · ก้อนยาง / A–D'
                }
                icon="flame"
              >
                <div className="report-ovens">
                  {['A', 'B', 'C', 'D'].map((b) => (
                    <section className="report-oven" key={b}>
                      <h5>
                        เตา {b}
                        {D.isOvenClosed(oven, b) ? (
                          <Badge tone="neutral" icon="power">
                            เตาปิด
                          </Badge>
                        ) : null}
                      </h5>
                      {D.isOvenClosed(oven, b) ? (
                        <p className="report-caption">เตาปิดในรอบนี้ · ไม่บันทึกค่าตรวจจริง</p>
                      ) : (
                        <Values
                          issues={['burner0', 'burner1', 'burner2', 'biscuit', 'temp'].map((k) =>
                            D.fieldRangeIssue(
                              D.fieldsFor('oven', round.snapshot, order).find(
                                (f: Obj) => f.key === b + '_' + k,
                              ),
                              oven.values[b + '_' + k],
                            ),
                          )}
                          items={[
                            ['SV · อุณหภูมิตั้ง', oven.values[b + '_burner0'], '°C'],
                            ['PV · อุณหภูมิจริง', oven.values[b + '_burner1'], '°C'],
                            ['เวลาอบยาง', reportDuration(oven.values[b + '_burner2'])],
                            ['น้ำหนัก Biscuit', oven.values[b + '_biscuit'], 'กก.'],
                            ['อุณหภูมิก้อนยาง', oven.values[b + '_temp'], '°C'],
                          ]}
                        />
                      )}
                    </section>
                  ))}
                </div>
                {D.ovenSettingsChangeText(oven).map((s: string) => (
                  <p className="report-setting-note" key={s}>
                    {s}
                  </p>
                ))}
                <Author entry={entries.oven} />
              </Detail>
            ) : null}
            {tower ? (
              <Detail title="หอโรย" subtitle="จำนวน ณ จุดตรวจ · ฝ่ายจักร · ล้าง / ซ่อม" icon="box">
                <Values
                  issues={['line8', 'line2'].map((k) =>
                    D.fieldRangeIssue(
                      D.fieldsFor('crates', round.snapshot, order).find((f: Obj) => f.key === k),
                      tower.values[k],
                    ),
                  )}
                  items={[
                    ['ฝ่ายจักร · Line 8', tower.values.line8, 'เก๊ะ'],
                    ['ฝ่ายจักร · Line 2', tower.values.line2, 'เก๊ะ'],
                  ]}
                />
                <table className="report-count-table">
                  <caption>จำนวนเก๊ะ ณ เวลาตรวจ</caption>
                  <thead>
                    <tr>
                      <th scope="col">จุด</th>
                      <th scope="col">เข้าเตา</th>
                      <th scope="col">หลังเตา</th>
                      <th scope="col">ออกหน้าเตา</th>
                    </tr>
                  </thead>
                  <tbody>
                    {['A', 'B', 'C', 'D'].map((b) => (
                      <tr key={b}>
                        <th scope="row">{b}</th>
                        {['in', 'after', 'out'].map((k) => (
                          <td
                            key={k}
                            className={
                              D.fieldRangeIssue(
                                D.fieldsFor('crates', round.snapshot, order).find(
                                  (f: Obj) => f.key === b + '_' + k,
                                ),
                                tower.values[b + '_' + k],
                              )
                                ? 'report-value-red'
                                : ''
                            }
                          >
                            {reportValue(tower.values[b + '_' + k])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="report-caption">
                  หน่วย: เก๊ะ · จำนวน ณ จุดตรวจไม่ใช่ยอดการเคลื่อนย้าย
                </p>
                <Values
                  issues={['wash', 'repair'].map((k) =>
                    D.fieldRangeIssue(
                      D.fieldsFor('crates', round.snapshot, order).find((f: Obj) => f.key === k),
                      tower.values[k],
                    ),
                  )}
                  items={[
                    ['ล้างเก๊ะ / ตะแกรง', tower.values.wash, 'เก๊ะ / 30 นาที'],
                    ['ซ่อมเก๊ะ / ตะแกรง', tower.values.repair, 'เก๊ะ / 30 นาที'],
                    ...(tower.repairNo
                      ? [['หมายเลขเก๊ะซ่อม', tower.repairNo] as [string, any]]
                      : []),
                  ]}
                />
                <Author entry={entries.crates} />
              </Detail>
            ) : null}
            {prod ? (
              <Detail
                title="ยางเสีย"
                subtitle={zero ? 'ทุกประเภท 0 ตัน' : 'ดูยอดแยกตามประเภท · ตัน'}
                icon="chart"
              >
                <Values
                  issues={D.DEFECTS.map(([k]: string[]) =>
                    D.fieldRangeIssue(
                      D.fieldsFor('production', round.snapshot, order).find(
                        (f: Obj) => f.key === k,
                      ),
                      prod.values[k],
                    ),
                  )}
                  items={D.DEFECTS.map(([k, label]: string[]) => [label, prod.values[k], 'ตัน'])}
                />
                <Author entry={entries.production} />
              </Detail>
            ) : null}
            {packing ? (
              <Detail
                title="PACK / โกดัง"
                subtitle={
                  'PACK ' + packing.packCustomer + ' / ' + packing.packSo + ' · แยก SO แต่ละงาน'
                }
                icon="warehouse"
              >
                <div className="report-pack-groups">
                  {[
                    [
                      'PACK',
                      packing.packCustomer,
                      packing.packSo,
                      [
                        ['จำนวนที่ PACK ทั้งหมด', packing.values.packTotal, 'ลัง'],
                        ['STR', packing.values.packStr, 'ลัง'],
                        ['PB', packing.values.packPb, 'ลัง'],
                      ],
                    ],
                    [
                      'เข้าโกดัง',
                      packing.warehouseCustomer,
                      packing.warehouseSo,
                      [
                        ['STR', packing.values.warehouseStr, 'ลัง'],
                        ['PB', packing.values.warehousePb, 'ลัง'],
                      ],
                    ],
                    [
                      'Defect',
                      packing.defectCustomer,
                      packing.defectSo,
                      [
                        ['ไอน้ำ', packing.values.steam, 'ลัง'],
                        ['ยาง WS', packing.values.defectWs, 'ลัง'],
                        ['ยางรา', packing.values.defectMold, 'ลัง'],
                        ['CT', packing.values.ct, 'ลัง'],
                        ['รวม STR', packing.values.defectStr, 'ลัง'],
                        ['รวม PB', packing.values.defectPb, 'ลัง'],
                      ],
                    ],
                  ].map(([title, customer, so, items]: any) => (
                    <section key={title}>
                      <h5>
                        {title}
                        <span>
                          {customer} / {so}
                        </span>
                      </h5>
                      <Values
                        issues={(
                          {
                            PACK: ['packTotal', 'packStr', 'packPb'],
                            เข้าโกดัง: ['warehouseStr', 'warehousePb'],
                            Defect: [
                              'steam',
                              'defectWs',
                              'defectMold',
                              'ct',
                              'defectStr',
                              'defectPb',
                            ],
                          } as any
                        )[title].map((k: string) =>
                          D.fieldRangeIssue(
                            D.fieldsFor('packing', round.snapshot, order).find(
                              (f: Obj) => f.key === k,
                            ),
                            packing.values[k],
                          ),
                        )}
                        items={items}
                      />
                    </section>
                  ))}
                </div>
                <Author entry={entries.packing} />
              </Detail>
            ) : null}
            {Object.entries(entries).some(
              ([, e]: any) => e.payload.notes?.trim() || e.payload.confirmation?.trim(),
            ) ? (
              <details className="report-qa-notes">
                <summary>หมายเหตุจาก QA</summary>
                {Object.entries(entries).map(([id, e]: any) =>
                  e.payload.notes?.trim() || e.payload.confirmation?.trim() ? (
                    <div key={id}>
                      <strong>{D.STATIONS.find((s: Obj) => s.id === id)?.name}</strong>
                      {e.payload.notes?.trim() ? <p>{e.payload.notes.trim()}</p> : null}
                      {e.payload.confirmation?.trim() ? (
                        <p>ยืนยันข้อสังเกต: {e.payload.confirmation.trim()}</p>
                      ) : null}
                    </div>
                  ) : null,
                )}
              </details>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
