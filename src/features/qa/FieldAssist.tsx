import { useState } from 'react';
import * as domain from '../../shared/domain.mjs';
import { Icon } from '../../shared/ui/ui';
const D: any = domain;
export default function FieldAssist({
  field,
  value,
  payload,
  onExplanation,
  attempted = false,
}: any) {
  const [open, setOpen] = useState(false),
    reason = payload.fieldExplanations?.[field.key] || '',
    missing = D.isMissingNumber(value),
    issue = D.fieldRangeIssue(field, value);
  const explain = field.required && field.requiresExplanation && missing;
  return (
    <div className="field-assist">
      {D.limitText(field) ? (
        <p className={'field-limit ' + (issue ? 'is-red' : '')}>
          {issue ? <Icon name="alert" size={14} /> : null}
          {issue ? issue.message : D.limitText(field)}
        </p>
      ) : null}
      {explain ? (
        open || value === 'NA' || attempted || reason ? (
          <label className="input-label missing-explanation" htmlFor={'explain-' + field.key}>
            คำอธิบายเมื่อไม่มีตัวเลข <span className="required-dot">*</span>
            <textarea
              id={'explain-' + field.key}
              value={reason}
              maxLength={500}
              rows={2}
              placeholder="เช่น เครื่องวัดขัดข้อง รอตรวจซ้ำ"
              onChange={(e) => onExplanation(field.key, e.target.value)}
              aria-invalid={attempted && !reason.trim()}
            />
          </label>
        ) : (
          <button type="button" className="explanation-toggle" onClick={() => setOpen(true)}>
            ไม่มีตัวเลข / ระบุคำอธิบาย
          </button>
        )
      ) : null}
    </div>
  );
}
