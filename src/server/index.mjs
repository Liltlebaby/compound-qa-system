import http from 'node:http';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { readFile, stat, mkdir, readdir, unlink } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { backupDatabase } from './backup.mjs';
import { loadEnvironment } from './environment.mjs';
import { openDatabase } from './database.mjs';
import { createService, ApiError } from './service.mjs';
import { stationAccount } from './station-accounts.mjs';
import { createLiveUpdates } from './live-updates.mjs';
import {
  DEFAULT_CONFIG,
  STATIONS,
  FACTORIES,
  FACTORY_SHIFTS,
  bangkokDate,
} from '../shared/domain.mjs';
import { requireSupervisor, requireFactory, requireStationScope } from '../shared/access.mjs';
loadEnvironment();
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = resolve(process.env.QA_DATA_DIR || resolve(root, 'data'));
const port = Number(process.env.QA_PORT || 3000),
  host = process.env.QA_HOST || '0.0.0.0';
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('QA_PORT invalid');
const { database, adapter } = await openDatabase();
const liveUpdates = createLiveUpdates();
const sessionHash = (t) => createHash('sha256').update(t).digest('hex');
const digest = (password, salt) => scryptSync(password, salt, 64).toString('hex');
const compare = (password, user) => {
  const actual = Buffer.from(digest(password, user.salt), 'hex'),
    expected = Buffer.from(user.password_hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const loopback = (req) =>
  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const localHost = (req) =>
  /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(req.headers.host || '');
const canSetup = (req) =>
  loopback(req) &&
  localHost(req) &&
  !req.headers['x-forwarded-for'] &&
  !req.headers['cf-connecting-ip'] &&
  !req.headers['forwarded'];
const hasAdmin = async () =>
  Boolean(await database.prepare('SELECT id FROM auth_users LIMIT 1').get());
const safeReturn = (value) => {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\u0000-\u001f\u007f\\\\]/.test(value)
  )
    return '/?mode=live';
  try {
    const u = new URL(value, 'http://qa.local');
    return u.origin === 'http://qa.local' ? u.pathname + u.search + u.hash : '/?mode=live';
  } catch {
    return '/?mode=live';
  }
};
const setting = async (name) =>
  (await database.prepare('SELECT value FROM server_settings WHERE name=?').get(name))?.value;
function normalizePublicUrl(value) {
  if (!value) return '';
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new ApiError(422, 'ที่อยู่เว็บไม่ถูกต้อง');
  }
  if (
    !['http:', 'https:'].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.pathname !== '/' ||
    u.search ||
    u.hash
  )
    throw new ApiError(422, 'ใช้ที่อยู่เว็บหลัก เช่น https://qa.example.com โดยไม่มี path');
  return u.origin;
}
let publicUrl = normalizePublicUrl(process.env.QA_PUBLIC_URL || (await setting('publicUrl')) || '');
const localAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && !n.internal && n.family === 'IPv4')
  .map((n) => n.address);
function deployed(req) {
  return {
    authProvider: 'local',
    publicUrl:
      publicUrl ||
      (!localHost(req)
        ? originFor(req)
        : 'http://' + (localAddresses[0] || 'localhost') + ':' + server.address().port),
    publicUrlConfigured: Boolean(publicUrl),
    https: secure(req),
    database: 'postgresql',
    dataLocation: 'PostgreSQL บนเซิร์ฟเวอร์',
    background: 'server-timer',
    port: server.address().port,
  };
}
function secure(req) {
  return (
    Boolean(req.socket.encrypted) ||
    (loopback(req) && req.headers['x-forwarded-proto'] === 'https') ||
    (publicUrl.startsWith('https://') && req.headers.host === new URL(publicUrl).host)
  );
}
function originFor(req) {
  return (secure(req) ? 'https' : 'http') + '://' + (req.headers.host || 'localhost:' + port);
}
async function identity(req) {
  const raw = (req.headers.cookie || '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('qa_session='))
    ?.slice(11);
  if (!raw) return null;
  const row = await database
    .prepare(
      'SELECT u.id,u.email,m.name,q.factory,q.shift,q.line,q.station_id FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id JOIN members m ON m.email=u.email LEFT JOIN station_accounts q ON q.id=u.id WHERE s.token_hash=? AND s.expires_at>? AND m.active=1',
    )
    .get(sessionHash(raw), new Date().toISOString());
  return row
    ? {
        userId: row.id,
        email: row.email,
        displayName: row.name,
        ...(row.station_id
          ? {
              stationScope: {
                factory: row.factory,
                shift: row.shift,
                line: row.line,
                stationId: row.station_id,
              },
            }
          : {}),
      }
    : null;
}
const service = (req) => createService(adapter, async () => identity(req), {}); // AI intentionally disabled in this release.
function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}
function redirect(res, location, cookie) {
  res.writeHead(302, {
    Location: location,
    'Cache-Control': 'no-store',
    ...(cookie ? { 'Set-Cookie': cookie } : {}),
  });
  res.end();
}
async function body(req) {
  let value = '';
  for await (const chunk of req) {
    value += chunk;
    if (value.length > 160000) throw new ApiError(413, 'ข้อมูลมีขนาดใหญ่เกินไป');
  }
  try {
    return JSON.parse(value || '{}');
  } catch {
    throw new ApiError(400, 'รูปแบบข้อมูลไม่ถูกต้อง');
  }
}
function accountFields(b) {
  const name = String(b.name || '').trim(),
    username = String(b.username || '')
      .trim()
      .toLowerCase(),
    password = String(b.password || '');
  if (
    !name ||
    name.length > 100 ||
    !/^[a-z0-9_.-]{3,40}$/.test(username) ||
    password.length < 8 ||
    password.length > 200
  )
    throw new ApiError(
      422,
      'กรอกชื่อ ชื่อผู้ใช้ 3–40 ตัว (a-z / ตัวเลข / _ . -) และรหัสผ่านอย่างน้อย 8 ตัว',
    );
  return { name, username, password, email: username + '@qa.local' };
}
const loginFailures = new Map();
function failLogin(key) {
  const r = loginFailures.get(key) || { count: 0, until: Date.now() + 900000 };
  r.count++;
  loginFailures.set(key, r);
}
async function api(req, res, u) {
  if (req.method === 'GET' && u.pathname === '/api/events') {
    const scope = { factory: u.searchParams.get('factory'), shift: u.searchParams.get('shift') };
    const authorize = async () => {
      const user = await service(req).member();
      if (!FACTORY_SHIFTS[scope.factory]?.some((shift) => shift.name === scope.shift))
        throw new ApiError(422, 'โรงงานหรือกะไม่ถูกต้อง');
      requireFactory(user, scope.factory);
      requireStationScope(user, scope);
    };
    await authorize();
    return liveUpdates.connect(req, res, authorize);
  }
  if (req.method === 'GET' && u.pathname === '/api/runtime') return json(res, deployed(req));
  if (req.method === 'GET' && u.pathname === '/api/auth/status')
    return json(res, {
      setupRequired: !(await hasAdmin()),
      canSetup: canSetup(req),
      setupPort: server.address().port,
    });
  if (req.method === 'POST') {
    const origin = req.headers.origin;
    if (origin && origin !== originFor(req)) throw new ApiError(403, 'ไม่อนุญาตคำขอข้ามเว็บไซต์');
    const b = await body(req);
    if (u.pathname === '/api/auth/setup') {
      if (!canSetup(req))
        throw new ApiError(
          403,
          'สร้างผู้ดูแลครั้งแรกจาก http://localhost บนเครื่องเซิร์ฟเวอร์เท่านั้น',
        );
      const a = accountFields(b),
        id = randomUUID(),
        salt = randomBytes(16).toString('hex'),
        hash = digest(a.password, salt);
      await database.transaction(async () => {
        if (await hasAdmin()) throw new ApiError(409, 'ตั้งค่าผู้ดูแลแล้ว กรุณาเข้าสู่ระบบ');
        await database
          .prepare('INSERT INTO auth_users VALUES (?,?,?,?,?)')
          .run(id, a.username, a.email, salt, hash);
        await database
          .prepare(
            'INSERT INTO members (id,email,name,role,stations,active,factories) VALUES (?,?,?,?,?,1,?)',
          )
          .run(
            id,
            a.email,
            a.name,
            'supervisor',
            JSON.stringify(STATIONS.map((s) => s.id)),
            JSON.stringify(FACTORIES),
          );
        await database
          .prepare('INSERT INTO workspace (id,owner_id,config,version) VALUES (1,?,?,1)')
          .run(id, JSON.stringify(DEFAULT_CONFIG));
      }, ['auth:initial-setup']);
      await dailyBackup();
      return json(res, { ok: true });
    }
    if (u.pathname === '/api/auth/login') {
      const username = String(b.username || '')
          .trim()
          .toLowerCase(),
        password = String(b.password || ''),
        key =
          (req.headers['cf-connecting-ip'] && loopback(req)
            ? String(req.headers['cf-connecting-ip'])
            : req.socket.remoteAddress) +
          '|' +
          username;
      const previous = loginFailures.get(key);
      if (previous && previous.until < Date.now()) loginFailures.delete(key);
      if (loginFailures.get(key)?.count >= 10)
        throw new ApiError(429, 'ลองเข้าสู่ระบบหลายครั้ง กรุณารอ 15 นาที');
      if (password.length > 200) throw new ApiError(422, 'ข้อมูลไม่ถูกต้อง');
      const user = await database
        .prepare(
          'SELECT u.*,m.active FROM auth_users u JOIN members m ON m.email=u.email WHERE username=?',
        )
        .get(username);
      if (!user || !user.active || !compare(password, user)) {
        failLogin(key);
        throw new ApiError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      }
      loginFailures.delete(key);
      const token = randomBytes(32).toString('base64url');
      await database
        .prepare('INSERT INTO auth_sessions VALUES (?,?,?)')
        .run(sessionHash(token), user.id, new Date(Date.now() + 86400000).toISOString());
      res.setHeader(
        'Set-Cookie',
        'qa_session=' +
          token +
          '; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400' +
          (secure(req) ? '; Secure' : ''),
      );
      return json(res, { ok: true, returnTo: safeReturn(b.returnTo) });
    }
    if (u.pathname === '/api/auth/station') {
      if (!(await hasAdmin()))
        throw new ApiError(
          409,
          'ให้หัวหน้าตั้งค่าผู้ดูแลครั้งแรกบนคอมเซิร์ฟเวอร์ก่อน จากนั้น QA สแกน QR ได้โดยไม่ต้องล็อกอิน',
        );
      const account = await stationAccount(database, b),
        current = await identity(req);
      if (current?.userId !== account.id) {
        const token = randomBytes(32).toString('base64url');
        await database
          .prepare('INSERT INTO auth_sessions VALUES (?,?,?)')
          .run(sessionHash(token), account.id, new Date(Date.now() + 86400000).toISOString());
        res.setHeader(
          'Set-Cookie',
          'qa_session=' +
            token +
            '; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400' +
            (secure(req) ? '; Secure' : ''),
        );
      }
      return json(res, { ok: true, scope: account.scope });
    }
    const svc = service(req),
      user = await svc.member();
    if (u.pathname === '/api/server-settings') {
      requireSupervisor(user);
      const next = normalizePublicUrl(String(b.publicUrl || '').trim());
      await database
        .prepare(
          'INSERT INTO server_settings VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value',
        )
        .run('publicUrl', next);
      publicUrl = next;
      await database
        .prepare('INSERT INTO settings_audits VALUES (?,?,?,?,?)')
        .run(
          randomUUID(),
          user.id,
          new Date().toISOString(),
          'server-public-url',
          JSON.stringify({ publicUrl: next }),
        );
      return json(res, { ok: true });
    }
    if (u.pathname === '/api/members') {
      requireSupervisor(user);
      const username = String(b.username || '')
        .trim()
        .toLowerCase();
      if (!/^[a-z0-9_.-]{3,40}$/.test(username))
        throw new ApiError(422, 'กรุณาระบุชื่อผู้ใช้ 3–40 ตัว (a-z / ตัวเลข / _ . -)');
      const email = String(b.email || username + '@qa.local')
          .trim()
          .toLowerCase(),
        existing = await database.prepare('SELECT * FROM auth_users WHERE email=?').get(email),
        taken = await database
          .prepare('SELECT email FROM auth_users WHERE username=?')
          .get(username);
      if (taken && taken.email !== email) throw new ApiError(409, 'ชื่อผู้ใช้นี้ถูกใช้แล้ว');
      const password = String(b.password || '');
      if ((!existing || password) && (password.length < 8 || password.length > 200))
        throw new ApiError(422, 'บัญชีใหม่หรือการเปลี่ยนรหัสผ่านต้องมีอย่างน้อย 8 ตัว');
      await svc.saveMember(user, { ...b, email });
      if (existing) {
        await database
          .prepare('UPDATE auth_users SET username=? WHERE id=?')
          .run(username, existing.id);
        if (password) {
          const salt = randomBytes(16).toString('hex');
          await database
            .prepare('UPDATE auth_users SET salt=?,password_hash=? WHERE id=?')
            .run(salt, digest(password, salt), existing.id);
          await database.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(existing.id);
        }
      } else {
        const salt = randomBytes(16).toString('hex');
        await database
          .prepare('INSERT INTO auth_users VALUES (?,?,?,?,?)')
          .run(randomUUID(), username, email, salt, digest(password, salt));
      }
      return json(res, { ok: true });
    }
    if (u.pathname === '/api/config') {
      await svc.updateConfig(user, b.config, b.version);
      return json(res, { ok: true });
    }
    if (u.pathname === '/api/rounds') return json(res, { id: await svc.createRound(user, b) });
    if (u.pathname === '/api/scan-round') return json(res, { id: await svc.scanRound(user, b) });
    if (u.pathname === '/api/backfill-round')
      return json(res, { id: await svc.backfillRound(user, b) });
    if (u.pathname === '/api/round-order') {
      await svc.addRoundOrder(user, b);
      return json(res, { ok: true });
    }
    if (u.pathname === '/api/tick') {
      const result = user.stationScope ? { ok: true } : await svc.generateReports();
      if (result.opened || result.generated) liveUpdates.publish();
      return json(res, result);
    }
    if (u.pathname === '/api/alarms/resolve') return json(res, await svc.resolveAlarm(user, b));
    if (u.pathname === '/api/alarms/ack') return json(res, await svc.acknowledgeAlarm(user, b));
    if (u.pathname === '/api/submissions') {
      const result = await svc.saveSubmission(user, b);
      await svc.generateReports();
      return json(res, { ok: true, ...result });
    }
    throw new ApiError(404, 'ไม่พบเส้นทาง');
  }
  if (req.method === 'GET' && u.pathname === '/api/state') {
    const svc = service(req),
      state = await svc.getState(await svc.member(), Object.fromEntries(u.searchParams));
    state.deployment = deployed(req);
    state.members = await Promise.all(
      state.members.map(async (m) => ({
        ...m,
        username:
          (await database.prepare('SELECT username FROM auth_users WHERE email=?').get(m.email))
            ?.username || '',
      })),
    );
    return json(res, state);
  }
  throw new ApiError(404, 'ไม่พบเส้นทาง');
}
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  try {
    const u = new URL(req.url || '/', originFor(req));
    if (
      req.method === 'POST' &&
      u.pathname.startsWith('/api/') &&
      !u.pathname.startsWith('/api/auth/') &&
      u.pathname !== '/api/tick'
    )
      res.once('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) liveUpdates.publish();
      });
    if (u.pathname.startsWith('/api/')) return await api(req, res, u);
    if (u.pathname === '/signin-with-chatgpt')
      return redirect(
        res,
        '/login?return_to=' + encodeURIComponent(safeReturn(u.searchParams.get('return_to'))),
      );
    if (u.pathname === '/signout-with-chatgpt' || u.pathname === '/logout') {
      const raw = (req.headers.cookie || '')
        .split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith('qa_session='))
        ?.slice(11);
      if (raw)
        await database
          .prepare('DELETE FROM auth_sessions WHERE token_hash=?')
          .run(sessionHash(raw));
      return redirect(
        res,
        '/login',
        'qa_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' + (secure(req) ? '; Secure' : ''),
      );
    }
    if (!['GET', 'HEAD'].includes(req.method)) throw new ApiError(405, 'ไม่รองรับคำขอ');
    const dist = resolve(root, 'dist/client');
    let file = resolve(dist, '.' + decodeURIComponent(u.pathname));
    if (!file.startsWith(dist + sep) && file !== dist) throw new ApiError(403, 'ไม่อนุญาต');
    let info = await stat(file).catch(() => null);
    if (info?.isDirectory()) file = resolve(file, 'index.html');
    info = await stat(file).catch(() => null);
    if (!info?.isFile()) {
      if (extname(u.pathname)) throw new ApiError(404, 'ไม่พบไฟล์');
      file = resolve(dist, 'index.html');
    }
    const type = MIME[extname(file)] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control':
        file.endsWith('sw.js') || file.endsWith('.html')
          ? 'no-cache'
          : u.pathname.startsWith('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch (e) {
    if (e instanceof ApiError) return json(res, { error: e.message }, e.status);
    console.error('QA request failed:', e.message);
    json(res, { error: 'ระบบทำงานไม่สำเร็จ กรุณาลองใหม่' }, 500);
  }
});
let ticking = false,
  backingUp = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const result = await createService(adapter, async () => null, {}).generateReports();
    if (result.opened || result.generated) liveUpdates.publish();
    await database
      .prepare('DELETE FROM auth_sessions WHERE expires_at<?')
      .run(new Date().toISOString());
    for (const [k, v] of loginFailures) if (v.until < Date.now()) loginFailures.delete(k);
  } catch (e) {
    console.error('Report check failed:', e.message);
  } finally {
    ticking = false;
  }
}
async function dailyBackup() {
  if (backingUp || !(await hasAdmin())) return;
  backingUp = true;
  try {
    const dir = resolve(dataDir, 'backups');
    await mkdir(dir, { recursive: true });
    const name =
        'compound-qa-' +
        bangkokDate() +
        '-' +
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Bangkok',
          hour: '2-digit',
          hour12: false,
        }).format(new Date()) +
        '.dump',
      file = resolve(dir, name);
    if (!(await stat(file).catch(() => null))) await backupDatabase(file);
    const files = (await readdir(dir))
      .filter((n) => /^compound-qa-\d{4}-\d{2}-\d{2}-\d{2}\.dump$/.test(n))
      .sort()
      .reverse();
    for (const old of files.slice(168)) await unlink(resolve(dir, old));
  } catch (e) {
    console.error('Backup failed:', e.message);
  } finally {
    backingUp = false;
  }
}
server.listen(port, host, () => {
  const actual = server.address().port;
  console.log('COMPOUND QA Windows server');
  console.log('Local setup: http://localhost:' + actual + '/login');
  for (const address of localAddresses) console.log('LAN: http://' + address + ':' + actual);
  console.log('Data: ' + dataDir);
  console.log('Report checks: every 30 seconds; reporting periods: 30 minutes');
  tick();
  dailyBackup();
});
let boundaryTimer;
function scheduleBoundary() {
  boundaryTimer = setTimeout(
    async () => {
      await tick();
      scheduleBoundary();
    },
    1800000 - (Date.now() % 1800000) + 25,
  );
}
scheduleBoundary();
const timer = setInterval(tick, 30000),
  backupTimer = setInterval(dailyBackup, 3600000);
async function close() {
  clearTimeout(boundaryTimer);
  clearInterval(timer);
  clearInterval(backupTimer);
  liveUpdates.close();
  server.close(async () => {
    await database.close();
    process.exit(0);
  });
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
