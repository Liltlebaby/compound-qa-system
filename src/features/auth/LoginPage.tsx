import { useEffect, useState } from 'react';
import { api } from '../../shared/api/client';
import { Button, Icon, Notice } from '../../shared/ui/ui';
import CompanyLogo from '../../shared/ui/CompanyLogo';
export default function Login() {
  const [status, setStatus] = useState<any>(null),
    [name, setName] = useState(''),
    [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const target = new URLSearchParams(window.location.search).get('return_to') || '/?mode=live';
  const setupPort = (import.meta as any).env?.DEV
    ? window.location.port || '5173'
    : status?.setupPort || window.location.port || '3000';
  const setupUrl = 'http://localhost:' + setupPort + '/login';
  useEffect(() => {
    api('auth/status')
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, []);
  async function submit(e: any) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (status?.setupRequired) {
        if (password !== confirm) throw new Error('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
        await api('auth/setup', { name, username, password });
      }
      const result = await api('auth/login', { username, password, returnTo: target });
      window.location.assign(result.returnTo);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="tw:grid tw:min-h-dvh tw:place-items-center tw:bg-surface tw:px-[20px] tw:py-[30px]">
      <div className="tw:w-full tw:max-w-[420px] tw:rounded-[16px] tw:border tw:border-solid tw:border-line tw:bg-white tw:p-[24px] tw:shadow-login tw:min-[480px]:p-[32px]">
        <a
          href="/?demo=1"
          className="tw:mb-[28px] tw:flex tw:flex-col tw:items-center tw:gap-[9px]"
        >
          <CompanyLogo className="company-logo-large" />
          <strong className="tw:text-[20px]">COMPOUND QA</strong>
          <span className="tw:text-[11px] tw:text-muted">AJ2 · AJ2B</span>
        </a>
        <h1 className="tw:text-center tw:text-[23px]">
          {status?.setupRequired ? 'ตั้งค่าผู้ดูแลครั้งแรก' : 'เข้าสู่ระบบพนักงาน'}
        </h1>
        <p className="tw:mt-[8px] tw:mb-[23px] tw:text-center tw:text-[12px] tw:text-muted">
          {status?.setupRequired
            ? 'สร้างบัญชีหัวหน้างานบนเครื่องเซิร์ฟเวอร์'
            : 'ใช้ชื่อผู้ใช้และรหัสผ่านที่หัวหน้ากำหนดให้'}
        </p>
        {error ? <Notice tone="red">{error}</Notice> : null}
        {status?.setupRequired && !status.canSetup ? (
          <Notice>
            กรุณาเปิด <a href={setupUrl}>{setupUrl}</a> บนคอมเซิร์ฟเวอร์ เพื่อตั้งค่าผู้ดูแลก่อน
          </Notice>
        ) : (
          <form onSubmit={submit} className="tw:flex tw:flex-col tw:gap-[17px]">
            {status?.setupRequired ? (
              <label className="input-label">
                ชื่อผู้ดูแล
                <input
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                />
              </label>
            ) : null}
            <label className="input-label">
              ชื่อผู้ใช้
              <input
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="รหัสพนักงาน หรือชื่อผู้ใช้"
                minLength={3}
                maxLength={40}
              />
            </label>
            <label className="input-label">
              รหัสผ่าน
              <input
                type="password"
                autoComplete={status?.setupRequired ? 'new-password' : 'current-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={status?.setupRequired ? 8 : undefined}
                maxLength={200}
              />
            </label>
            {status?.setupRequired ? (
              <label className="input-label">
                ยืนยันรหัสผ่าน
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={8}
                />
              </label>
            ) : null}
            <Button type="submit" icon="shield" busy={busy || !status} className="full tw:mt-[8px]">
              {status?.setupRequired ? 'สร้างผู้ดูแลและเข้าสู่ระบบ' : 'เข้าสู่ระบบ'}
            </Button>
          </form>
        )}
        <a
          className="tw:mt-[24px] tw:mb-[12px] tw:flex tw:items-center tw:justify-center tw:gap-[7px] tw:text-[12px] tw:text-brand tw:hover:underline"
          href="/?demo=1"
        >
          ดูข้อมูลตัวอย่าง
          <Icon name="arrow" size={15} />
        </a>
        <small className="tw:block tw:text-center tw:text-[10px] tw:text-muted">
          ข้อมูลจริงเก็บบนคอมเซิร์ฟเวอร์ของโรงงาน
        </small>
      </div>
    </main>
  );
}
