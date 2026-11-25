import * as domain from '../../shared/domain.mjs';
import type { DataRecord as Obj } from '../../shared/types';
import { Icon } from '../../shared/ui/ui';
const D: any = domain;

export default function QualitySnapshot({
  round,
  order,
  entry,
}: {
  round: Obj;
  order: Obj;
  entry?: Obj;
}) {
  const fields = D.fieldsFor('quality', round.snapshot, order);
  return (
    <section className="dash-quality dash-surface">
      <div className="dash-section-heading">
        <h2>ผลตรวจคุณภาพ</h2>
        <Icon name="flask" size={19} />
      </div>
      <div className="dash-quality-values">
        {fields.map((field: Obj) => {
          const value = entry?.payload.values[field.key],
            number = D.asNumber(value);
          const issue = D.fieldRangeIssue(field, value),
            limit = ['min', 'max']
              .filter((key) => D.asNumber(field.limit?.[key]) !== null)
              .map((key) => (key === 'min' ? 'Min ' : 'Max ') + field.limit[key])
              .join(' · ');
          const status = !entry
            ? 'รอผลตรวจ'
            : number === null
              ? 'ไม่ตัดสินผล'
              : issue
                ? 'นอกเกณฑ์'
                : limit
                  ? 'อยู่ในเกณฑ์'
                  : 'ไม่มีเกณฑ์สเปก';
          return (
            <div className={issue ? 'is-critical' : ''} key={field.key}>
              <span>{field.label}</span>
              <strong>{value === 'NA' ? '-' : number === null ? '—' : String(value)}</strong>
              <small>
                {issue ? <Icon name="alert" size={12} /> : null}
                {status}
              </small>
              <span className="dash-quality-limit">{limit || 'ไม่มีเกณฑ์ตัดสิน'}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
