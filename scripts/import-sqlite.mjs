import { DatabaseSync, backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/server/database.mjs';
import { loadEnvironment } from '../src/server/environment.mjs';

const TABLES = [
  'auth_users',
  'members',
  'workspace',
  'rounds',
  'requests',
  'submissions',
  'audits',
  'reports',
  'settings_audits',
  'oven_setting_events',
  'station_accounts',
  'auth_sessions',
  'server_settings',
  'qa_alarms',
  'qa_alarm_events',
];
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
function fingerprint(rows) {
  const canonical = rows
    .map((row) =>
      JSON.stringify(
        Object.fromEntries(
          Object.keys(row)
            .sort()
            .map((key) => [key, row[key]]),
        ),
      ),
    )
    .sort();
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/** Import a consistent SQLite snapshot, refusing any non-empty PostgreSQL destination. */
export async function importSqlite(
  file,
  {
    connectionString = process.env.DATABASE_URL,
    schema = process.env.QA_DB_SCHEMA || 'public',
  } = {},
) {
  const source = new DatabaseSync(resolve(file), { readOnly: true });
  let destination;
  try {
    const backupDir = join(dirname(resolve(file)), 'backups');
    await mkdir(backupDir, { recursive: true });
    await backup(
      source,
      join(
        backupDir,
        'pre-postgresql-' + new Date().toISOString().replaceAll(':', '-') + '.sqlite',
      ),
    );
    source.exec('BEGIN');
    const tables = new Set(
      source
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((row) => row.name),
    );
    const snapshots = TABLES.map((table) => ({
      table,
      rows: tables.has(table) ? source.prepare('SELECT * FROM ' + quote(table)).all() : [],
    }));
    source.exec('COMMIT');
    const checksum = fingerprint(
      snapshots.map(({ table, rows }) => ({ table, hash: fingerprint(rows) })),
    );
    destination = await openDatabase({ connectionString, schema });
    const { database, pool } = destination;
    return await database.transaction(async () => {
      await database.exec(
        'CREATE TABLE IF NOT EXISTS _sqlite_imports (checksum text PRIMARY KEY, imported_at text NOT NULL, counts text NOT NULL)',
      );
      if (
        await database
          .prepare('SELECT checksum FROM _sqlite_imports WHERE checksum=?')
          .get(checksum)
      )
        return { alreadyImported: true };
      await database.exec(
        'LOCK TABLE ' + TABLES.map(quote).join(',') + ' IN ACCESS EXCLUSIVE MODE',
      );
      for (const table of TABLES) {
        if ((await database.prepare('SELECT COUNT(*) n FROM ' + quote(table)).get()).n)
          throw new Error('Import refused: destination contains data in ' + table);
      }
      const counts = {};
      for (const { table, rows } of snapshots) {
        const columns = (
          await pool.query(
            'SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2',
            [schema, table],
          )
        ).rows.map((row) => row.column_name);
        for (const row of rows) {
          const keys = Object.keys(row);
          if (keys.some((key) => !columns.includes(key)))
            throw new Error('Unrecognized source column in ' + table);
          await database
            .prepare(
              'INSERT INTO ' +
                quote(table) +
                ' (' +
                keys.map(quote).join(',') +
                ') VALUES (' +
                keys.map(() => '?').join(',') +
                ')',
            )
            .run(...keys.map((key) => row[key]));
        }
        const target = await database.prepare('SELECT * FROM ' + quote(table)).all();
        if (target.length !== rows.length || fingerprint(target) !== fingerprint(rows))
          throw new Error('Import verification failed: ' + table);
        counts[table] = rows.length;
      }
      await database
        .prepare('INSERT INTO _sqlite_imports VALUES (?,?,?)')
        .run(checksum, new Date().toISOString(), JSON.stringify(counts));
      return { alreadyImported: false, counts, verified: 'all row contents and counts match' };
    }, ['compound-qa:sqlite-import']);
  } finally {
    source.close();
    await destination?.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv.includes('--development') ? 'development' : 'production';
  loadEnvironment(mode);
  const file = process.argv.slice(2).find((value) => !value.startsWith('--'));
  if (!file)
    throw new Error(
      'Usage: npm run db:import-sqlite -- path/to/compound-qa.sqlite [--development]',
    );
  console.log(JSON.stringify(await importSqlite(file)));
}
