import { createServer } from 'vite';
import { loadEnvironment } from '../src/server/environment.mjs';
import { startLocalPostgres } from './postgres-local.mjs';
loadEnvironment('development');
await startLocalPostgres();
import { buildServer } from './build-server.mjs';
import { mkdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { networkInterfaces } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const dataDir = resolve(process.env.QA_DEV_DATA_DIR || resolve(root, 'data-dev'));
const addresses = Object.entries(networkInterfaces())
  .flatMap(([name, list]) =>
    (list || [])
      .filter((n) => n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.'))
      .map((n) => ({ name, address: n.address })),
  )
  .sort(
    (a, b) =>
      Number(/virtual|vmware|vethernet|vpn|tailscale/i.test(a.name)) -
      Number(/virtual|vmware|vethernet|vpn|tailscale/i.test(b.name)),
  );
const mobileBase =
  process.env.QA_DEV_PUBLIC_URL || 'http://' + (addresses[0]?.address || 'localhost') + ':5173';
await mkdir(dataDir, { recursive: true });
await buildServer();
let vite,
  closed = false,
  timer,
  api,
  restarting = false;
function startApi() {
  const child = spawn(process.execPath, ['dist/server/index.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      QA_PORT: '3001',
      QA_ENV: 'development',
      QA_HOST: '127.0.0.1',
      QA_DATA_DIR: dataDir,
      QA_PUBLIC_URL: mobileBase,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (data) => process.stdout.write('[API] ' + data));
  child.stderr.on('data', (data) => process.stderr.write('[API] ' + data));
  child.on('exit', (code) => {
    if (!closed && !restarting && api === child) {
      console.error('Local API stopped:', code);
      close().finally(() => process.exit(code || 1));
    }
  });
  return child;
}
async function stopApi() {
  const child = api;
  if (child && child.exitCode === null)
    await new Promise((done) => {
      child.once('exit', done);
      child.kill();
    });
}
async function restartApi() {
  if (closed || restarting) return;
  restarting = true;
  try {
    await buildServer();
    await stopApi();
    if (!closed) api = startApi();
  } catch (e) {
    console.error('Service reload failed:', e.message);
  } finally {
    restarting = false;
  }
}
function changed() {
  clearTimeout(timer);
  timer = setTimeout(restartApi, 250);
}
const watchers = [
  watch(resolve(root, 'src/server'), (_, file) => {
    if (file && /\.(ts|mjs)$/.test(file)) changed();
  }),
  watch(resolve(root, 'src/shared'), (_, file) => {
    if (file?.endsWith('.mjs')) changed();
  }),
];
async function close() {
  if (closed) return;
  closed = true;
  clearTimeout(timer);
  for (const watcher of watchers) watcher.close();
  await vite?.close();
  await stopApi();
}
api = startApi();
process.on('SIGINT', () => close().finally(() => process.exit(0)));
process.on('SIGTERM', () => close().finally(() => process.exit(0)));
try {
  // Readiness is checked through loopback before exposing the development UI.
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (api.exitCode !== null) throw new Error('Local API did not start');
    try {
      const r = await fetch('http://127.0.0.1:3001/api/runtime');
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw new Error('Local API readiness timeout');
  vite = await createServer();
  await vite.listen();
  console.log('\nCOMPOUND QA local development');
  console.log('Open: http://localhost:5173/?demo=1');
  console.log('Employee login: http://localhost:5173/login');
  console.log('Mobile on the same Wi-Fi: ' + mobileBase + '/?demo=1');
  console.log('Station QR codes use: ' + mobileBase);
  console.log('Frontend updates immediately; API restarts after server edits.');
  console.log('Development data: ' + dataDir);
} catch (e) {
  console.error(e.message);
  await close();
  process.exit(1);
}
