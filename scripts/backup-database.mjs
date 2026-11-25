import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { loadEnvironment } from '../src/server/environment.mjs';
import { backupDatabase } from '../src/server/backup.mjs';
loadEnvironment();
const directory = resolve(process.env.QA_DATA_DIR || 'data', 'backups');
await mkdir(directory, { recursive: true });
const file = resolve(
  directory,
  'manual-' + new Date().toISOString().replaceAll(':', '-') + '.dump',
);
await backupDatabase(file);
console.log('PostgreSQL backup created:', file);
