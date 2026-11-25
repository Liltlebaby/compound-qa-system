'use client';
import {
  ArrowLeft,
  ArrowUpRight,
  Boxes,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Flame,
  FlaskConical,
  History,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MoreHorizontal,
  Minus,
  Pencil,
  Plus,
  Printer,
  Power,
  QrCode,
  RefreshCw,
  ScanLine,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserRound,
  Warehouse,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
const icons: any = {
  alarms: TriangleAlert,
  flame: Flame,
  flask: FlaskConical,
  chart: ChartNoAxesCombined,
  box: Boxes,
  warehouse: Warehouse,
  dashboard: LayoutDashboard,
  stations: ClipboardList,
  reports: FileText,
  qr: QrCode,
  settings: Settings,
  right: ChevronRight,
  check: Check,
  clock: Clock,
  alert: TriangleAlert,
  wifi: Wifi,
  offline: WifiOff,
  back: ArrowLeft,
  close: X,
  plus: Plus,
  send: Send,
  copy: Copy,
  download: Download,
  refresh: RefreshCw,
  logout: LogOut,
  history: History,
  user: UserRound,
  print: Printer,
  power: Power,
  more: MoreHorizontal,
  minus: Minus,
  arrow: ArrowUpRight,
  checks: CheckCheck,
  shield: ShieldCheck,
  down: ChevronDown,
  trash: Trash2,
  scan: ScanLine,
  loader: LoaderCircle,
  calendar: CalendarDays,
  edit: Pencil,
  external: ExternalLink,
};
export function Icon({ name, size = 20, ...props }: any) {
  const C = icons[name] || ClipboardList;
  return <C size={size} strokeWidth={1.8} aria-hidden="true" {...props} />;
}
export function Button({ children, icon, variant = '', className = '', busy, ...props }: any) {
  return (
    <button
      className={'button ' + variant + ' ' + className}
      {...props}
      disabled={props.disabled || busy}
    >
      {icon ? (
        <Icon name={busy ? 'loader' : icon} className={busy ? 'spin' : ''} size={18} />
      ) : null}
      {children}
    </button>
  );
}
export function Badge({ children, tone = 'neutral', icon }: any) {
  return (
    <span className={'badge ' + tone}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </span>
  );
}
export function Notice({ children, tone = 'amber', icon = 'alert' }: any) {
  return (
    <div className={'notice ' + tone}>
      <Icon name={icon} size={19} />
      <div>{children}</div>
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    const cancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el?.addEventListener('cancel', cancel);
    return () => {
      el?.removeEventListener('cancel', cancel);
      el?.close();
    };
  }, [onClose]);
  return (
    <dialog
      ref={ref}
      className={'modal ' + (wide ? 'wide' : '')}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-shell">
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button className="icon-button" aria-label="ปิดหน้าต่าง" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
export function Empty({ icon = 'stations', title, description, action }: any) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={28} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Metric({ label, value, unit, accent, sub }: any) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <div className={'metric-value ' + (accent ? 'accent' : '')}>
        {value}
        <small>{unit}</small>
      </div>
      {sub ? <span className="metric-sub">{sub}</span> : null}
    </div>
  );
}
export function PageHeading({ title, description, children }: any) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
