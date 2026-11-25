import { spawn } from 'node:child_process';
import { rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export function postgresEnvironment(connectionString = process.env.DATABASE_URL) {
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

export async function backupDatabase(file, { schema = process.env.QA_DB_SCHEMA } = {}) {
  if (schema === 'public') schema = undefined;
  if (schema && !/^qa_test_[a-f0-9]+$/.test(schema)) throw new Error('Invalid backup test schema');
  const temporary = file + '.partial';
  const executable = process.env.PG_BIN
    ? join(process.env.PG_BIN, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump')
    : 'pg_dump';
  try {
    await new Promise((done, reject) => {
      const child = spawn(
        executable,
        [
          '--no-password',
          '--format=custom',
          ...(schema ? ['--schema', schema] : []),
          '--file',
          temporary,
        ],
        { env: postgresEnvironment(), stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
      );
      let error = '';
      child.stderr.on('data', (value) => {
        error += value;
      });
      child.on('error', () => reject(new Error('pg_dump unavailable; configure PG_BIN')));
      child.on('exit', (code) =>
        code === 0
          ? done()
          : reject(
              new Error(
                'PostgreSQL backup failed (' +
                  code +
                  '): ' +
                  error.replaceAll(process.env.DATABASE_URL || 'never-match', '[redacted]'),
              ),
            ),
      );
    });
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
