import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { Client } from 'pg';
import { existsSync, openSync, closeSync } from 'node:fs';
import { readFile, writeFile, mkdir, cp, rename, unlink, readdir } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { releaseRoots, releaseFiles, sha256, verifyRelease } from './deployment-files.mjs';
import { extractRelease } from './extract-release.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const state = join(root, 'data'),
  pidFile = join(state, 'server-process.json');
const maintenance = join(state, 'maintenance.lock');
const node = existsSync(join(root, 'runtime/node.exe'))
  ? join(root, 'runtime/node.exe')
  : process.execPath;
const pgBin = join(root, '.postgres/runtime/bin');
const envPath = join(root, '.env.production.local');
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const quote = (s) => '"' + String(s).replaceAll('"', '""') + '"';
async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
async function save(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}
function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((s) => /^\w+=/.test(s))
      .map((s) => {
        const i = s.indexOf('=');
        return [
          s.slice(0, i),
          s
            .slice(i + 1)
            .trim()
            .replace(/^(['"])(.*)\1$/, '$2'),
        ];
      }),
  );
}
async function config(mode = 'production') {
  if (!['production', 'development'].includes(mode)) throw new Error('Invalid environment');
  const result = parseEnv(await readFile(join(root, `.env.${mode}.local`), 'utf8'));
  if (!result.DATABASE_URL) throw new Error('Run SETUP-SERVER.cmd first');
  return result;
}
async function saveConfig(value) {
  const temporary = envPath + '.new';
  await writeFile(
    temporary,
    Object.entries(value)
      .map(([k, v]) => k + '=' + JSON.stringify(v))
      .join('\n') + '\n',
    { mode: 0o600 },
  );
  await rename(temporary, envPath);
}
function pgEnvironment(connectionString) {
  const url = new URL(connectionString);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: url.searchParams.get('sslmode') || 'prefer',
  };
}
function run(exe, args, options = {}) {
  return new Promise((done, reject) => {
    const child = spawn(exe, args, {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
    let out = '',
      err = '';
    child.stdout?.on('data', (b) => (out += b));
    child.stderr?.on('data', (b) => (err += b));
    child.on('error', () => reject(new Error('Cannot run ' + basename(exe))));
    child.on('exit', (code) => {
      child.stdout?.destroy();
      child.stderr?.destroy();
      const safeError = err
        .replace(/postgres(?:ql)?:\/\/\S+/g, '[database]')
        .replaceAll(options.env?.PGPASSWORD || '\0', '[redacted]');
      return code === 0
        ? done(out)
        : reject(new Error(basename(exe) + ' failed (' + code + '). ' + safeError.slice(-1800)));
    });
  });
}
async function withDatabase(url, action) {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.end();
  }
}
async function tables(client) {
  return (
    await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows.map((r) => r.tablename);
}
async function fingerprint(client) {
  const result = {};
  for (const name of await tables(client)) {
    const rows = (
      await client.query(`SELECT row_to_json(t)::text AS value FROM public.${quote(name)} t`)
    ).rows
      .map((r) => r.value)
      .sort();
    result[name] = { count: rows.length, sha256: sha256(JSON.stringify(rows)) };
  }
  return result;
}
async function backup(mode = 'production', directory = join(state, 'backups', 'manual')) {
  const env = await config(mode),
    filename = 'compound-qa-' + stamp() + '.dump',
    file = join(resolve(directory), filename);
  await mkdir(dirname(file), { recursive: true });
  const records = await withDatabase(env.DATABASE_URL, async (client) => {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try {
      const snapshot = (await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
      const values = await fingerprint(client);
      await run(
        join(env.PG_BIN || pgBin, 'pg_dump.exe'),
        [
          '--no-password',
          '--format=custom',
          '--schema=public',
          '--snapshot',
          snapshot,
          '--file',
          file + '.partial',
        ],
        { env: pgEnvironment(env.DATABASE_URL) },
      );
      await rename(file + '.partial', file);
      await client.query('COMMIT');
      return values;
    } catch (e) {
      await client.query('ROLLBACK');
      await unlink(file + '.partial').catch(() => {});
      throw e;
    }
  });
  await save(file + '.json', {
    format: 1,
    product: 'compound-qa-data',
    createdAt: new Date().toISOString(),
    sourceMode: mode,
    sha256: sha256(await readFile(file)),
    tables: records,
  });
  console.log('Backup saved: ' + file);
  return file;
}
async function restore(file, url, { migration = false } = {}) {
  file = resolve(file);
  const manifest = await json(file + '.json');
  if (
    manifest.product !== 'compound-qa-data' ||
    manifest.format !== 1 ||
    manifest.sha256 !== sha256(await readFile(file))
  )
    throw new Error('Backup verification failed');
  await withDatabase(url, async (client) => {
    const objects = await client.query(
      "SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') + (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AS count",
    );
    if (Number(objects.rows[0].count))
      throw new Error('Restore requires an empty database. Existing data will not be overwritten.');
  });
  // public already exists in a new database. Exclude only its CREATE statement.
  // Never --clean the target: concurrent objects must cause a rollback instead.
  const list = await run(join(pgBin, 'pg_restore.exe'), ['--list', file]);
  const selection = join(state, 'restore-' + randomBytes(8).toString('hex') + '.list');
  await mkdir(state, { recursive: true });
  await writeFile(
    selection,
    list
      .split(/\r?\n/)
      .filter((line) => !/^\d+; \d+ \d+ SCHEMA - public(?: |$)/.test(line))
      .join('\n'),
  );
  try {
    await run(
      join(pgBin, 'pg_restore.exe'),
      [
        '--no-password',
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
        '--single-transaction',
        '--use-list',
        selection,
        '--dbname',
        new URL(url).pathname.slice(1),
        file,
      ],
      { env: pgEnvironment(url) },
    );
  } finally {
    await unlink(selection).catch(() => {});
  }
  await withDatabase(url, async (client) => {
    const actual = await fingerprint(client);
    if (JSON.stringify(actual) !== JSON.stringify(manifest.tables))
      throw new Error('Restored records do not match backup');
    if (migration) {
      await client.query('BEGIN');
      try {
        await client.query('DELETE FROM auth_sessions');
        await client.query("DELETE FROM server_settings WHERE name='publicUrl'");
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
  });
  console.log('Restored and verified all table fingerprints.');
}
async function freePort() {
  const socket = createServer();
  await new Promise((done, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', done);
  });
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  return port;
}
async function health(port, child) {
  for (let i = 0; i < 100; i++) {
    if (child && child.exitCode !== null) throw new Error('Server exited before becoming ready');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/status`, {
        signal: AbortSignal.timeout(1000),
      });
      const value = await response.json();
      if (response.ok && typeof value.setupRequired === 'boolean') return value;
    } catch {}
    await pause(200);
  }
  throw new Error('Server health check timed out; see data/logs');
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function ownedProcess(record) {
  if (
    !record ||
    !Number.isInteger(record.pid) ||
    record.pid < 1 ||
    record.root !== root ||
    !alive(record.pid)
  )
    return false;
  const cmd = await run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${record.pid}').CommandLine`,
  ]);
  return (
    cmd.toLowerCase().includes(join(root, 'dist/server-tools.mjs').toLowerCase()) &&
    /\bserve\b/.test(cmd)
  );
}
async function stop() {
  if (!existsSync(pidFile)) return;
  const record = await json(pidFile);
  if (alive(record.pid)) {
    if (!(await ownedProcess(record)))
      throw new Error('PID belongs to another process; refusing to stop it');
    await run('taskkill.exe', ['/PID', String(record.pid), '/T', '/F']);
  }
  await unlink(pidFile).catch(() => {});
  console.log('QA server stopped. PostgreSQL data retained.');
}
async function serve() {
  if (existsSync(maintenance)) throw new Error('Server is in maintenance mode');
  await mkdir(state, { recursive: true });
  const handle = await import('node:fs/promises')
    .then((fs) => fs.open(pidFile, 'wx'))
    .catch(async (e) => {
      if (e.code !== 'EEXIST') throw e;
      if (await ownedProcess(await json(pidFile))) throw new Error('Server already running');
      await unlink(pidFile);
      return (await import('node:fs/promises')).open(pidFile, 'wx');
    });
  await handle.writeFile(JSON.stringify({ pid: process.pid, root, at: new Date().toISOString() }));
  await handle.close();
  const env = await config();
  await mkdir(join(state, 'logs'), { recursive: true });
  const log = openSync(join(state, 'logs/server.log'), 'a');
  const child = spawn(node, [join(root, 'dist/start.mjs')], {
    cwd: root,
    windowsHide: true,
    stdio: ['ignore', log, log],
    env: { ...process.env, ...env, QA_ENV: 'production', QA_DB_SCHEMA: 'public' },
  });
  closeSync(log);
  const code = await new Promise((done, reject) => {
    child.once('error', reject);
    child.once('exit', done);
  });
  await unlink(pidFile).catch(() => {});
  process.exitCode = code || 0;
}
async function start() {
  if (existsSync(maintenance)) throw new Error('Server is in maintenance mode');
  if (existsSync(pidFile) && (await ownedProcess(await json(pidFile)))) {
    console.log('QA server is already running.');
    return;
  }
  const env = await config(),
    port = Number(env.QA_PORT || 3000);
  // A busy port must never be mistaken for this application.
  const socket = createServer();
  await new Promise((done, reject) => {
    socket.once('error', () => reject(new Error('HTTP port is already in use')));
    socket.listen(port, '0.0.0.0', done);
  });
  await new Promise((r) => socket.close(r));
  await mkdir(join(state, 'logs'), { recursive: true });
  const log = openSync(join(state, 'logs/server.log'), 'a');
  const child = spawn(node, [join(root, 'dist/server-tools.mjs'), 'serve'], {
    cwd: root,
    windowsHide: true,
    detached: true,
    stdio: ['ignore', log, log],
    env: { ...process.env, QA_ENV: 'production' },
  });
  child.unref();
  closeSync(log);
  await health(port);
  if (!existsSync(pidFile) || !(await ownedProcess(await json(pidFile))))
    throw new Error('Server process could not be verified');
  console.log('QA server ready: http://localhost:' + port + '/?mode=live');
}
async function setup() {
  await verifyRelease(root);
  await run(node, [join(root, 'dist/postgres-local.mjs'), 'setup'], { stdio: 'inherit' });
  const env = await config();
  await saveConfig({
    ...env,
    QA_PORT: env.QA_PORT || '3000',
    QA_HOST: '0.0.0.0',
    PG_BIN: pgBin.replaceAll('\\', '/'),
  });
  console.log('Setup complete. Restore transferred data BEFORE starting a new empty system.');
}
async function restoreCommand(file) {
  if (!file) throw new Error('Drag the .dump file onto RESTORE-DATA.cmd or pass its path');
  if (existsSync(pidFile) && alive((await json(pidFile)).pid))
    throw new Error('Stop the server before restoring');
  const env = await config();
  await run(node, [join(root, 'dist/postgres-local.mjs')]);
  await restore(file, env.DATABASE_URL, { migration: true });
}
async function github(command) {
  const gh = existsSync(join(root, 'runtime/gh.exe')) ? join(root, 'runtime/gh.exe') : 'gh';
  if (command === 'login') {
    await run(
      gh,
      ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web'],
      { stdio: 'inherit' },
    );
    return;
  }
  const dir = join(state, 'updates', stamp());
  await mkdir(dir, { recursive: true });
  await run(
    gh,
    [
      'release',
      'download',
      '--repo',
      'Liltlebaby/compound-qa',
      '--pattern',
      'compound-qa-update.zip*',
      '--dir',
      dir,
    ],
    { stdio: 'inherit' },
  );
  return join(dir, 'compound-qa-update.zip');
}
async function candidateDatabase(currentUrl) {
  const local = await json(join(root, '.postgres/local.json')),
    url = new URL(currentUrl);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || Number(url.port || 5432) !== local.port)
    throw new Error(
      'Automatic updates require the bundled local PostgreSQL. Ask IT for external database updates.',
    );
  const name = 'qa_release_' + Date.now() + '_' + randomBytes(4).toString('hex');
  await withDatabase(
    `postgresql://${local.admin}:${local.password}@127.0.0.1:${local.port}/postgres`,
    async (client) => {
      const owner = (
        await client.query(
          'SELECT pg_get_userbyid(datdba) AS name FROM pg_database WHERE datname=$1',
          [url.pathname.slice(1)],
        )
      ).rows[0]?.name;
      if (owner !== decodeURIComponent(url.username))
        throw new Error('Database owner does not match configured application user');
      await client.query(`CREATE DATABASE ${quote(name)} OWNER ${quote(owner)}`);
    },
  );
  url.pathname = '/' + name;
  return url.toString();
}
async function stageCheck(stage, url, baseline) {
  const port = await freePort(),
    log = openSync(join(stage, 'check.log'), 'a');
  const child = spawn(node, [join(stage, 'dist/server/index.mjs')], {
    cwd: stage,
    windowsHide: true,
    stdio: ['ignore', log, log],
    env: {
      ...process.env,
      DATABASE_URL: url,
      QA_ENV: 'production',
      QA_PORT: String(port),
      QA_HOST: '127.0.0.1',
      QA_DB_SCHEMA: 'public',
      QA_DATA_DIR: join(stage, 'check-data'),
      PG_BIN: pgBin,
    },
  });
  closeSync(log);
  try {
    await health(port, child);
    const page = await fetch(`http://127.0.0.1:${port}/`);
    if (!page.ok || !(await page.text()).includes('<html'))
      throw new Error('Client health check failed');
    await withDatabase(url, async (client) => {
      const after = await fingerprint(client);
      // Migrations must retain every historical record; never silently accept a smaller data set.
      for (const [name, before] of Object.entries(baseline)) {
        if (name === 'qa_migrations') continue;
        if (!after[name] || after[name].count < before.count)
          throw new Error('Migration lost records: ' + name);
      }
    });
  } finally {
    if (child.exitCode === null) {
      const ended = new Promise((r) => child.once('exit', r));
      child.kill();
      await ended;
    }
  }
}
async function update(file) {
  if (!file) file = await github('download');
  file = resolve(file);
  const expected = (await readFile(file + '.sha256', 'utf8')).trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/.test(expected) || sha256(await readFile(file)) !== expected)
    throw new Error('Update archive checksum failed');
  const id = stamp(),
    stage = join(state, 'updates', id, 'staging');
  await mkdir(dirname(stage), { recursive: true });
  await extractRelease(file, stage);
  const release = await verifyRelease(stage);
  if (
    existsSync(join(root, 'release.json')) &&
    (await json(join(root, 'release.json'))).version === release.version
  ) {
    console.log('This release is already installed: ' + release.version);
    return;
  }
  const env = await config(),
    history = join(state, 'rollback', id);
  await mkdir(history, { recursive: true });
  const lock = await import('node:fs/promises')
    .then((fs) => fs.open(maintenance, 'wx'))
    .catch(() => {
      throw new Error('Maintenance already active. See README-SERVER.md recovery steps.');
    });
  await lock.writeFile(JSON.stringify({ id, stage, history, startedAt: new Date().toISOString() }));
  await lock.close();
  let switched = false,
    stopped = false;
  try {
    await stop();
    stopped = true;
    const dump = await backup('production', history),
      manifest = await json(dump + '.json');
    await cp(envPath, join(history, 'environment.local'));
    for (const path of [...releaseRoots, ...releaseFiles, 'release.json'])
      if (existsSync(join(root, path)))
        await cp(join(root, path), join(history, 'code', path), { recursive: true });
    const candidate = await candidateDatabase(env.DATABASE_URL);
    await save(join(history, 'recovery.json'), {
      version: release.version,
      oldDatabase: new URL(env.DATABASE_URL).pathname.slice(1),
      candidateDatabase: new URL(candidate).pathname.slice(1),
      backup: dump,
    });
    await restore(dump, candidate);
    await stageCheck(stage, candidate, manifest.tables);
    // No database is dropped. Old code, environment and database remain together for recovery.
    switched = true;
    for (const path of [...releaseRoots, ...releaseFiles, 'release.json']) {
      const target = join(root, path),
        source = join(stage, path);
      if (existsSync(target) && releaseRoots.includes(path))
        await rename(target, join(history, 'replaced-' + path.replaceAll('/', '-')));
      await cp(source, target, { recursive: true, force: true });
    }
    await saveConfig({ ...env, DATABASE_URL: candidate });
    await unlink(maintenance);
    await start();
    await save(join(history, 'result.json'), {
      success: true,
      version: release.version,
      finishedAt: new Date().toISOString(),
    });
    console.log(
      'Updated to ' + release.version + '. Backup and previous database retained in ' + history,
    );
  } catch (e) {
    if (switched) {
      // Stop a failed new process before restoring the matched old code/database configuration.
      await stop();
      for (const path of [...releaseRoots, ...releaseFiles, 'release.json'])
        if (existsSync(join(history, 'code', path))) {
          if (existsSync(join(root, path)) && releaseRoots.includes(path))
            await rename(join(root, path), join(history, 'failed-' + path.replaceAll('/', '-')));
          await cp(join(history, 'code', path), join(root, path), { recursive: true, force: true });
        }
      await cp(join(history, 'environment.local'), envPath);
    }
    await unlink(maintenance).catch(() => {});
    if (stopped) await start();
    throw new Error('Update failed; previous server restored. ' + e.message);
  }
}
const command = process.argv[2];
try {
  if (command === 'setup') await setup();
  else if (command === 'serve') await serve();
  else if (command === 'start') await start();
  else if (command === 'stop') await stop();
  else if (command === 'backup') await backup(process.argv[3] || 'production', process.argv[4]);
  else if (command === 'restore') await restoreCommand(process.argv[3]);
  else if (command === 'github-login') await github('login');
  else if (command === 'update') await update(process.argv[3]);
  else if (command === 'verify')
    console.log('Release verified:', (await verifyRelease(root)).version);
  else
    throw new Error(
      'Commands: setup | start | stop | serve | backup | restore | github-login | update | verify',
    );
} catch (e) {
  console.error('ERROR: ' + e.message);
  process.exitCode = 1;
}
