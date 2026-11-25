import * as domain from '../../shared/domain.mjs';
import type { DataRecord as Obj } from '../../shared/types';
import { Empty, Icon, Modal } from '../../shared/ui/ui';
const D: any = domain;
export default function HistoryModal({ target, audits, onClose }: any) {
  const { station, round, order } = target,
    items = audits.filter(
      (a: Obj) => a.roundId === round.id && a.stationId === station.id && a.orderId === order.id,
    );
  return (
    <Modal
      title={'ประวัติ · ' + station.name}
      subtitle={order.customer + '/' + order.so + ' · ' + round.start + '–' + round.end}
      onClose={onClose}
      wide
    >
      <div className="modal-body">
        {items.length ? (
          items.map((a: Obj) => (
            <article className="audit-item" key={a.id}>
              <div className="section-heading">
                <strong>{a.actorName}</strong>
                <span className="muted tiny">
                  {new Date(a.at).toLocaleString('th-TH-u-ca-gregory', {
                    timeZone: 'Asia/Bangkok',
                  })}
                </span>
              </div>
              <p>{a.reason}</p>
              <div className="audit-values">
                {D.fieldsFor(station.id, round.snapshot, order)
                  .filter((f: Obj) => a.before?.values?.[f.key] !== a.after?.values?.[f.key])
                  .map((f: Obj) => (
                    <div key={f.key}>
                      <span>{f.label}</span>
                      <span>
                        {D.formatValue(a.before?.values?.[f.key])}
                        <Icon name="arrow" size={14} />
                        <strong>{D.formatValue(a.after?.values?.[f.key])}</strong>
                      </span>
                    </div>
                  ))}
              </div>
              {[
                'notes',
                'confirmation',
                'packCustomer',
                'packSo',
                'warehouseCustomer',
                'warehouseSo',
                'defectCustomer',
                'defectSo',
                'washNo',
                'repairNo',
                'replacementFor',
              ]
                .filter((k) => a.before?.[k] !== a.after?.[k] && a.after?.[k])
                .map((k) => (
                  <p className="muted tiny" key={k}>
                    {
                      (
                        {
                          notes: 'หมายเหตุ',
                          confirmation: 'ยืนยันข้อสังเกต',
                          packCustomer: 'ลูกค้า PACK',
                          packSo: 'SO PACK',
                          warehouseCustomer: 'ลูกค้าโกดัง',
                          warehouseSo: 'SO โกดัง',
                          defectCustomer: 'ลูกค้า defect',
                          defectSo: 'SO defect',
                          washNo: 'หมายเลขเก๊ะล้าง',
                          repairNo: 'หมายเลขเก๊ะซ่อม',
                          replacementFor: 'แทนเวร',
                        } as Obj
                      )[k]
                    }
                    : {a.before?.[k] || '—'} → {a.after[k]}
                  </p>
                ))}
            </article>
          ))
        ) : (
          <Empty
            icon="history"
            title="ยังไม่มีประวัติแก้ไข"
            description="ข้อมูลตัวอย่างเริ่มต้นจากรายงานที่ให้มา เมื่อทดลองแก้ไขจะเห็นประวัติที่นี่"
          />
        )}
      </div>
    </Modal>
  );
}
