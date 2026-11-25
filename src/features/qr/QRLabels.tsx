import { Moon, Sun } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { download } from '../../shared/api/client';
import { Button, Icon, Notice } from '../../shared/ui/ui';
import QRPoster from './QRPoster';
import { QR_FONT_URL, QR_GROUPS, posterSvg, qrAddress, qrPosters } from './poster-model.mjs';

let fontPromise: Promise<string> | null = null;
function posterFont() {
  if (!fontPromise)
    fontPromise = fetch(QR_FONT_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error('โหลดฟอนต์สำหรับป้ายไม่สำเร็จ กรุณาลองอีกครั้ง');
        const bytes = new Uint8Array(await response.arrayBuffer());
        let text = '';
        for (let i = 0; i < bytes.length; i += 32768)
          text += String.fromCharCode(...bytes.subarray(i, i + 32768));
        return btoa(text);
      })
      .catch((error) => {
        fontPromise = null;
        throw error;
      });
  return fontPromise;
}

interface QRLabelsProps {
  config: Record<string, any>;
  demo: boolean;
  publicUrl?: string;
  onScopeChange: (factory: string, shift: string) => void | Promise<void>;
  onToast: (message: string) => void;
  factories?: string[];
}

export default function QRLabels({
  config,
  demo,
  publicUrl,
  onScopeChange,
  onToast,
  factories,
}: QRLabelsProps) {
  const base = qrAddress(publicUrl || window.location.origin);
  const posters = useMemo(() => (base ? qrPosters(config, base, demo) : []), [config, base, demo]);
  const current = QR_GROUPS.find(
    (group) => group.factory === config.factory && group.shift === config.shift,
  )!;
  const [printSelection, setPrintSelection] = useState('');
  const [downloading, setDownloading] = useState('');
  useEffect(() => {
    document.body.classList.add('qr-studio-active');
    const reset = () => setPrintSelection('');
    window.addEventListener('afterprint', reset);
    return () => {
      document.body.classList.remove('qr-studio-active');
      window.removeEventListener('afterprint', reset);
    };
  }, []);

  function printLabels(labelId = '') {
    if (!base || !posters.length) return;
    flushSync(() => setPrintSelection(labelId));
    window.print();
  }
  async function savePoster(poster: (typeof posters)[number]) {
    setDownloading(poster.labelId);
    try {
      download(
        poster.labelId + (demo ? '-DEMO' : '') + '.svg',
        posterSvg(poster, { fontData: await posterFont() }),
        'image/svg+xml;charset=utf-8',
      );
      onToast('ดาวน์โหลดป้ายแล้ว · มีชื่อโรง กะ ฝ่าย และ QR ครบในไฟล์เดียว');
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'ดาวน์โหลดป้ายไม่สำเร็จ');
    } finally {
      setDownloading('');
    }
  }

  return (
    <section className="qr-studio">
      <div className="qr-scope-choices" role="group" aria-label="เลือกชุด QR ตามโรงและกะ">
        {QR_GROUPS.filter((group) => !factories || factories.includes(group.factory)).map(
          (group) => {
            const selected = group.key === current.key,
              ShiftIcon = group.shift === 'กะดึก' ? Moon : Sun;
            return (
              <button
                key={group.key}
                type="button"
                aria-pressed={selected}
                aria-label={group.factory + ' ' + group.shift}
                className={'qr-scope-choice' + (selected ? ' selected' : '')}
                style={{ '--qr-accent': group.color, '--qr-light': group.light } as CSSProperties}
                onClick={() => {
                  if (!selected) void onScopeChange(group.factory, group.shift);
                }}
              >
                <span className="qr-scope-factory">{group.factory}</span>
                <span className="qr-scope-shift">
                  <ShiftIcon size={21} strokeWidth={1.8} />
                  {group.shift}
                </span>
                <span className="qr-scope-status">
                  {selected ? (
                    <>
                      <Icon name="check" size={15} />
                      กำลังแสดง
                    </>
                  ) : (
                    'เลือกชุดนี้'
                  )}
                </span>
              </button>
            );
          },
        )}
      </div>
      <div className="qr-collection-heading">
        <div>
          <h2>
            {current.factory} <span>· {current.shift}</span>
          </h2>
          <p>
            {config.line} · {posters.length} จุดตรวจ · ป้ายใช้ซ้ำได้ทุกรอบ
          </p>
        </div>
        <Button icon="print" disabled={!base || !posters.length} onClick={() => printLabels()}>
          พิมพ์ทั้งชุด {posters.length} ป้าย
        </Button>
      </div>
      {!base ? (
        <Notice icon="wifi">
          ยังไม่มีที่อยู่ที่มือถือเปิดได้ ให้ตั้ง URL สำหรับ QR ในหน้าตั้งค่า หรือเชื่อม Wi-Fi
          แล้วเปิดระบบใหม่
        </Notice>
      ) : (
        <div className={'qr-destination ' + (demo ? 'is-demo' : '')}>
          <Icon name={demo ? 'flask' : 'scan'} size={20} />
          <div>
            <strong>
              {demo ? 'ชุดสาธิต · ไม่ใช้บันทึกข้อมูลจริง' : 'สแกนแล้วเข้าฟอร์มฝ่ายนั้นทันที'}
            </strong>
            <p>
              โรงและกะล็อกตามป้าย ·{' '}
              {demo ? 'ข้อมูลตัวอย่างแยกแต่ละเครื่อง' : 'เข้าบัญชีประจำจุดอัตโนมัติ'}
            </p>
          </div>
          <a href={base + '/?' + (demo ? 'demo=1' : 'mode=live')} target="_blank" rel="noreferrer">
            {new URL(base).host}
            <Icon name="external" size={14} />
          </a>
        </div>
      )}
      <div className="qr-print-help">
        <Icon name="reports" size={16} />
        <span>A4 · 1 ป้ายต่อหน้า · พิมพ์สีหรือบันทึกเป็น PDF ได้</span>
      </div>
      <div className="qr-poster-grid">
        {posters.map((poster) => (
          <article
            key={poster.labelId}
            className="qr-poster-card"
            data-label-id={poster.labelId}
            data-print-hidden={
              printSelection && printSelection !== poster.labelId ? 'true' : undefined
            }
          >
            <div className="qr-card-heading">
              <span>{poster.number}</span>
              <h3>{poster.name}</h3>
              <small>{poster.line}</small>
            </div>
            <QRPoster poster={poster} />
            <div className="qr-card-actions">
              <Button
                variant="small outline"
                icon="print"
                aria-label={'พิมพ์ป้าย ' + poster.name}
                onClick={() => printLabels(poster.labelId)}
              >
                พิมพ์
              </Button>
              <Button
                variant="small outline"
                icon="download"
                busy={downloading === poster.labelId}
                aria-label={'ดาวน์โหลดป้าย ' + poster.name}
                onClick={() => savePoster(poster)}
              >
                SVG
              </Button>
              <a
                className="button small ghost"
                href={poster.url}
                target="_blank"
                rel="noreferrer"
                aria-label={'เปิดฟอร์ม ' + poster.factory + ' ' + poster.shift + ' ' + poster.name}
              >
                เปิดฟอร์ม
                <Icon name="arrow" size={15} />
              </a>
            </div>
          </article>
        ))}
      </div>
      <p className="qr-studio-note">
        ตรวจชื่อโรง กะ และฝ่ายบนป้ายก่อนติดตั้ง · เมื่อเปลี่ยนที่อยู่เซิร์ฟเวอร์ให้พิมพ์ QR ชุดใหม่
      </p>
    </section>
  );
}
