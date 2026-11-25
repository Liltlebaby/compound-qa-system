import { existsSync, createWriteStream } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url)),
  local = resolve(root, '.postgres'),
  runtime = resolve(local, 'runtime');
const run = (executable, args) =>
  new Promise((done, reject) => {
    const child = spawn(executable, args, { cwd: root, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? done() : reject(new Error('PostgreSQL setup stopped: ' + code)),
    );
  });
if (process.platform !== 'win32')
  throw new Error('Install PostgreSQL using your OS package manager and configure DATABASE_URL.');
await mkdir(local, { recursive: true });
if (!existsSync(resolve(runtime, 'bin/pg_ctl.exe'))) {
  const archive = resolve(local, 'postgresql.zip'),
    unpacked = resolve(local, 'unpacked');
  console.log('Downloading PostgreSQL Windows binaries from EDB (about 385 MB).');
  const response = await fetch('https://sbp.enterprisedb.com/getfile.jsp?fileid=1260609', {
    signal: AbortSignal.timeout(600000),
  });
  if (!response.ok) throw new Error('PostgreSQL download failed: ' + response.status);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archive + '.partial'));
  await rename(archive + '.partial', archive);
  await run('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    resolve(root, 'scripts/windows/Expand-Postgres.ps1'),
    '-Archive',
    archive,
    '-Destination',
    unpacked,
  ]);
  const source = resolve(unpacked, 'pgsql');
  if (
    !source.startsWith(local + sep) ||
    !runtime.startsWith(local + sep) ||
    !existsSync(resolve(source, 'bin/initdb.exe'))
  )
    throw new Error('Unexpected PostgreSQL archive layout');
  await rename(source, runtime);
}
await run(process.execPath, [resolve(root, 'dist/postgres-local.mjs'), 'setup']);
