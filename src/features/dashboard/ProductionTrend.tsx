import * as domain from '../../shared/domain.mjs';
import type { DataRecord as Obj } from '../../shared/types';
import { productionSeries, seriesTotals } from './dashboard-model.mjs';
const D: any = domain;

export default function ProductionTrend({
  rounds,
  submissions,
  round,
  order,
  onRoundChange,
}: {
  rounds: Obj[];
  submissions: Obj[];
  round: Obj;
  order: Obj;
  onRoundChange: (id: string) => void;
}) {
  const series = productionSeries(rounds, submissions, round, order);
  const totals = seriesTotals(series);
  return (
    <section className="dash-trend dash-surface" aria-label="ผลผลิตแต่ละรอบ">
      <div className="dash-section-heading">
        <div>
          <h2>ผลผลิตแต่ละรอบ</h2>
          <p>
            {D.displayDate(round.date)} · {order.customer} / {order.so} · หน่วยตัน
          </p>
        </div>
        <div className="dash-trend-total">
          <span>สะสมจากรอบที่มีตัวเลข</span>
          <strong>
            {D.numberText(totals.actual)} <small>ตัน</small>
          </strong>
          <span>
            {totals.recorded} / {totals.total} รอบ
          </span>
        </div>
      </div>
      <div className="dash-chart-legend">
        <span>
          <i className="actual" />
          ผลผลิต PB
        </span>
        <span>
          <i className="target" />
          เป้าของแต่ละรอบ
        </span>
        <span>
          <i className="missing" />
          ยังไม่มีตัวเลข
        </span>
      </div>
      <div
        className="dash-chart-scroll"
        tabIndex={0}
        aria-label="เลื่อนดูรอบการผลิต และกดรอบเพื่อดูรายละเอียด"
      >
        <div className="dash-chart" style={{ minWidth: Math.max(260, series.length * 78) }}>
          {series.map((point: Obj) => (
            <button
              key={point.id}
              className={'dash-chart-column ' + (point.id === round.id ? 'selected' : '')}
              aria-pressed={point.id === round.id}
              aria-label={
                'รอบ ' +
                point.start +
                '–' +
                point.end +
                ' ผลผลิต ' +
                (point.actual === null ? 'ยังไม่มีตัวเลข' : D.numberText(point.actual) + ' ตัน') +
                ' เป้า ' +
                D.numberText(point.target) +
                ' ตัน'
              }
              onClick={() => onRoundChange(point.id)}
            >
              <span className="dash-bar-plot">
                {point.target !== null && point.target > 0 ? (
                  <span
                    className="dash-bar-target"
                    style={{ bottom: (point.target / totals.maximum) * 100 + '%' }}
                  />
                ) : null}
                {point.actual === null ? (
                  <span className="dash-bar-empty">—</span>
                ) : (
                  <span
                    className="dash-bar"
                    style={{ height: Math.max(1, (point.actual / totals.maximum) * 100) + '%' }}
                  >
                    <strong>{D.numberText(point.actual)}</strong>
                  </span>
                )}
              </span>
              <span className="dash-bar-time">
                {point.start}
                <small>{point.end}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      <p className="dash-chart-hint">
        กดแท่งกราฟเพื่อดูรอบนั้น · รวมเฉพาะโรง กะ ไลน์ และลูกค้า/SO ที่เลือก
      </p>
    </section>
  );
}
