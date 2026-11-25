import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const local = resolve(root, '.postgres'),
  bin = join(local, 'runtime', 'bin'),
  data = join(local, 'data');
const settings = join(local, 'local.json');
async function run(name, args, { allowFailure = false } = {}) {
  return new Promise((done, reject) => {
    const child = spawn(join(bin, name + '.exe'), args, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (b) => (output += b));
    child.stderr.on('data', (b) => (output += b));
    child.on('error', () =>
      reject(new Error('PostgreSQL binaries missing. See docs/POSTGRESQL.md.')),
    );
    child.on('exit', (code) => {
      // pg_ctl's background server can inherit pipe handles on Windows.
      child.stdout.destroy();
      child.stderr.destroy();
      return code === 0 || allowFailure
        ? done({ code, output })
        : reject(new Error(name + ' failed: ' + output));
    });
  });
}

export async function startLocalPostgres() {
  if (!existsSync(settings)) return; // External PostgreSQL is configured via DATABASE_URL.
  const config = JSON.parse(await readFile(settings, 'utf8'));
  if ((await run('pg_ctl', ['status', '-D', data], { allowFailure: true })).code === 0) return;
  await run('pg_ctl', ['start', '-D', data, '-l', join(local, 'postgres.log'), '-w', '-t', '30']);
  console.log('Local PostgreSQL ready on 127.0.0.1:' + config.port);
}

async function setup() {
  const { Client } = await import('pg');
  let config;
  if (existsSync(settings)) config = JSON.parse(await readFile(settings, 'utf8'));
  else {
    if (existsSync(join(data, 'PG_VERSION')))
      throw new Error('Existing cluster found; restore local.json instead of overwriting data.');
    await mkdir(local, { recursive: true });
    config = {
      port: Number(process.env.QA_PG_PORT || 5432),
      admin: 'qa_cluster_admin',
      password: randomBytes(32).toString('hex'),
    };
    if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535)
      throw new Error('QA_PG_PORT must be between 1024 and 65535');
    const passwordFile = join(local, 'init-password.tmp');
    await writeFile(passwordFile, config.password, { mode: 0o600 });
    try {
      await run('initdb', [
        '-D',
        data,
        '-U',
        config.admin,
        '--pwfile=' + passwordFile,
        '--auth-host=scram-sha-256',
        '--auth-local=scram-sha-256',
        '--encoding=UTF8',
        '--locale=C',
      ]);
    } finally {
      await unlink(passwordFile).catch(() => {});
    }
    await writeFile(
      join(data, 'postgresql.auto.conf'),
      "listen_addresses = '127.0.0.1'\nport = " + config.port + '\nmax_connections = 60\n',
    );
    await writeFile(settings, JSON.stringify(config), { mode: 0o600 });
  }
  await startLocalPostgres();
  const admin = new Client({
    host: '127.0.0.1',
    port: config.port,
    user: config.admin,
    password: config.password,
    database: 'postgres',
  });
  await admin.connect();
  try {
    for (const mode of ['development', 'production']) {
      const database = mode === 'development' ? 'compound_qa_dev' : 'compound_qa';
      const role = database + '_app',
        envFile = join(root, `.env.${mode}.local`);
      if (existsSync(envFile)) continue;
      const existingRole = (
        await admin.query('SELECT rolname FROM pg_roles WHERE rolname=$1', [role])
      ).rows[0];
      let account = config.accounts?.[mode];
      if (existingRole && !account)
        throw new Error(
          'Database role already exists but its local credentials are missing. Restore the environment file before continuing.',
        );
      if (!account) {
        account = { password: randomBytes(32).toString('hex') };
        config.accounts = { ...config.accounts, [mode]: account };
        await writeFile(settings, JSON.stringify(config), { mode: 0o600 });
      }
      const password = account.password;
      if (!existingRole)
        await admin.query(
          `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
        );
      const existingDatabase = (
        await admin.query(
          'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1',
          [database],
        )
      ).rows[0];
      if (existingDatabase && existingDatabase.owner !== role)
        throw new Error('Database exists with a different owner; setup will not overwrite it.');
      if (!existingDatabase) await admin.query(`CREATE DATABASE "${database}" OWNER "${role}"`);
      const url = `postgresql://${role}:${password}@127.0.0.1:${config.port}/${database}`;
      await writeFile(
        join(root, `.env.${mode}.local`),
        `DATABASE_URL=${url}\nPG_BIN="${bin.replaceAll('\\', '/')}"\n`,
        { mode: 0o600, flag: 'wx' },
      );
    }
  } finally {
    await admin.end();
  }
  console.log(
    'Separate development/production databases and restricted app roles created. Credentials saved locally; not printed.',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'setup') await setup();
  else if (process.argv[2] === 'stop')
    await run('pg_ctl', ['stop', '-D', data, '-m', 'fast', '-w']);
  else await startLocalPostgres();
}
