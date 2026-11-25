import { download } from '../../shared/api/client';
import * as domain from '../../shared/domain.mjs';
import { time } from '../../shared/format/time';
import { reportShareText } from '../../shared/report-format.mjs';
import type { DataRecord as Obj } from '../../shared/types';
import { Badge, Button, Empty, Icon, Notice } from '../../shared/ui/ui';
import ReportDocument from './ReportDocument';
const D: any = domain;
interface ReportsPageProps {
  round?: Obj;
  report?: Obj;
  roundReports: Obj[];
  reportVersion: string;
  setReportVersion: (id: string) => void;
  reportReady: boolean;
  share: () => Promise<void>;
  copyReport: () => Promise<void>;
  progress: Obj;
  state: Obj;
  selected: string;
  nav: (view: string) => void;
}
export default function ReportsPage({
  round,
  report,
  roundReports,
  reportVersion,
  setReportVersion,
  reportReady,
  share,
  copyReport,
  progress,
  state,
  selected,
  nav,
}: ReportsPageProps) {
  const audits = state.audits.filter((a: Obj) => a.roundId === selected);
  return round ? (
    <div className="reports-layout">
      <section className={'panel report-document ' + (report ? 'has-report' : '')}>
        {!report ? (
          <div className="section-heading">
            <div>
              <h2>รอข้อมูลครบก่อนออกรายงาน</h2>
              <p className="muted tiny">ระบบจะไม่สร้างรายงานจากข้อมูลบางส่วน</p>
            </div>
          </div>
        ) : null}
        {report ? (
          <>
            <div className="report-command-bar">
              <div className="report-version-row">
                <select
                  aria-label="ฉบับรายงาน"
                  value={report.id}
                  onChange={(e) => setReportVersion(e.target.value)}
                >
                  {roundReports.map((r: Obj) => (
                    <option key={r.id} value={r.id}>
                      ฉบับ {r.revision}
                      {r.changes ? ' · แก้ไข' : ''} · {time(r.createdAt)}
                    </option>
                  ))}
                </select>
                <Badge tone="green" icon={report.source === 'ai' ? 'checks' : 'reports'}>
                  {report.source === 'ai' ? 'AI + สูตรคำนวณ' : 'สรุปตามสูตร'}
                </Badge>
              </div>
              <div className="report-action-row">
                <Button
                  icon="send"
                  disabled={!reportReady || report.id !== roundReports[0]?.id}
                  onClick={share}
                >
                  แชร์เข้า WhatsApp
                </Button>
                <Button icon="copy" variant="outline" onClick={copyReport}>
                  คัดลอก
                </Button>
                <Button
                  icon="download"
                  variant="ghost"
                  onClick={() =>
                    download(
                      'COMPOUND-' +
                        round.date +
                        '-' +
                        round.start.replace(':', '') +
                        '-v' +
                        report.revision +
                        '.txt',
                      reportShareText(round, report),
                    )
                  }
                >
                  ดาวน์โหลด
                </Button>
              </div>
            </div>
            {reportVersion && report.id !== roundReports[0]?.id ? (
              <Notice>กำลังดูฉบับย้อนหลัง ใช้ฉบับล่าสุดเมื่อต้องการแชร์</Notice>
            ) : null}
            <ReportDocument round={round} report={report} />
            <p className="muted tiny">
              การเปิด WhatsApp หรือเมนูแชร์ยังไม่ถือว่าส่งสำเร็จ ต้องเลือกกลุ่มและกดยืนยันใน
              WhatsApp
            </p>
          </>
        ) : (
          <>
            <Notice>
              <strong>ยังขาด {progress.missing.length} รายการ</strong>
              <p>
                {progress.missing
                  .map(
                    (m: Obj) =>
                      D.STATIONS.find((s: Obj) => s.id === m.stationId)?.name +
                      ' / ' +
                      round.snapshot.orders.find((o: Obj) => o.id === m.orderId)?.so,
                  )
                  .join(' · ') || 'ข้อมูลครบแล้ว รอปิดรอบ'}
              </p>
            </Notice>
            <Empty
              icon="reports"
              title="รายงานจะอยู่ตรงนี้เมื่อพร้อม"
              description="QA ส่งครบทุกจุดและจบรอบแล้ว ระบบจะคำนวณและสร้างสรุปให้"
              action={
                <Button variant="outline" onClick={() => nav('stations')}>
                  ไปที่จุดตรวจ QA
                </Button>
              }
            />
          </>
        )}
      </section>
      <aside className="report-side">
        <details className="report-meta-fold">
          <summary>
            <Icon name="reports" size={18} />
            เกี่ยวกับรายงาน
            <Icon name="down" size={17} />
          </summary>
          <section className="panel">
            <h3>การสรุปอัตโนมัติ</h3>
            <ol className="steps">
              <li>รับข้อมูลจาก QA ทุกจุด</li>
              <li>คำนวณผลผลิตและตรวจสเปก</li>
              <li>สร้างรายงานและเก็บฉบับแก้ไข</li>
              <li>แชร์เข้ากลุ่ม WhatsApp เดิม</li>
            </ol>
            <Notice tone="neutral" icon="reports">
              {state.integrations.ai
                ? 'เปิดใช้ AI เลือกประเด็นจากข้อเท็จจริง'
                : 'AI ยังไม่เชื่อมต่อ · ใช้สรุปตามสูตรอัตโนมัติได้'}
            </Notice>
            <p className="muted tiny">
              การส่งเข้ากลุ่มอัตโนมัติยังไม่เปิดใช้ จนกว่าจะทดสอบการเชื่อมต่อกับกลุ่มจริง
            </p>
          </section>
        </details>
        <details className="report-meta-fold">
          <summary>
            <Icon name="history" size={18} />
            ประวัติการแก้ไข ({audits.length})<Icon name="down" size={17} />
          </summary>
          <section className="panel">
            <h3>ประวัติการแก้ไข</h3>
            {audits.slice(0, 8).map((a: Obj) => (
              <div className="audit-mini" key={a.id}>
                <Icon name="history" size={16} />
                <div>
                  <strong>{D.STATIONS.find((s: Obj) => s.id === a.stationId)?.name}</strong>
                  <p>
                    {a.actorName} · {time(a.at)}
                  </p>
                  <small>{a.reason}</small>
                </div>
              </div>
            ))}
            {!state.audits.some((a: Obj) => a.roundId === selected) ? (
              <p className="muted">ยังไม่มีการแก้ไขในรอบนี้</p>
            ) : null}
          </section>
        </details>
      </aside>
    </div>
  ) : (
    <Empty
      icon="reports"
      title="ไม่มีรายงานในวันที่เลือก"
      description="เลือกวันที่อื่นจากปฏิทินเพื่อดูข้อมูลย้อนหลัง"
    />
  );
}
