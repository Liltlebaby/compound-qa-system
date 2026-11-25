import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from './helpers/database.mjs';
import { parameterize } from '../src/server/database.mjs';
import { stationAccount } from '../src/server/station-accounts.mjs';
import { createService } from '../dist/server/service.mjs';
import {
  DEFAULT_CONFIG,
  STATIONS,
  fieldsFor,
  prepareOvenPayload,
  ovenSettingDefaults,
} from '../src/shared/domain.mjs';
import { importSqlite } from '../scripts/import-sqlite.mjs';
import { backupDatabase, postgresEnvironment } from '../src/server/backup.mjs';

test('PostgreSQL keeps quoted placeholders and rolls back all statements on conflict', async () => {
  assert.equal(parameterize("SELECT '?',\"?\",?, 'it''s ?'"), "SELECT '?',\"?\",$1, 'it''s ?'");
  const db = await openDatabase();
  try {
    await assert.rejects(
      db.adapter.batch([
        db.adapter.prepare('INSERT INTO server_settings VALUES (?,?)').bind('rollback', 'first'),
        db.adapter
          .prepare('INSERT INTO server_settings VALUES (?,?)')
          .bind('rollback', 'duplicate'),
      ]),
      { code: '23505' },
    );
    assert.equal(
      await db.database.prepare('SELECT * FROM server_settings WHERE name=?').get('rollback'),
      undefined,
    );
  } finally {
    await db.close();
  }
});

test('PostgreSQL concurrent QR scans, submissions, and report ticks remain idempotent', async () => {
  const db = await openDatabase();
  try {
    await db.database
      .prepare('INSERT INTO workspace VALUES(1,?,?,1)')
      .run('owner', JSON.stringify(DEFAULT_CONFIG));
    const scope = { factory: 'AJ2', shift: 'กะเช้า', line: 'Line 8', stationId: 'quality' };
    const accounts = await Promise.all(
      Array.from({ length: 12 }, () => stationAccount(db.database, scope)),
    );
    assert.equal(new Set(accounts.map((account) => account.id)).size, 1);
    assert.equal((await db.database.prepare('SELECT COUNT(*) n FROM station_accounts').get()).n, 1);
    const svc = createService(db.adapter, async () => null, {
        clock: () => new Date('2026-10-30T11:00:00+07:00'),
      }),
      admin = { id: 'owner', name: 'QA test', role: 'supervisor' };
    const roundId = await svc.createRound(admin, {
      factory: 'AJ2',
      shift: 'กะเช้า',
      date: '2026-10-30',
      start: '10:00',
    });
    const round = (
        await svc.getState(admin, { factory: 'AJ2', shift: 'กะเช้า', date: '2026-10-30' })
      ).rounds.find((row) => row.id === roundId),
      order = round.snapshot.orders[0];
    const bodies = STATIONS.map((station) => {
      const values = Object.fromEntries(
        fieldsFor(station.id, round.snapshot, order).map((field) => [field.key, '0']),
      );
      if (station.id === 'quality') Object.assign(values, { po: '36', pri: '24', mv: '61.2' });
      if (station.id === 'production') values.pb = '6.30';
      let payload = {
        values,
        confirmation: 'test',
        packCustomer: 'MRF',
        packSo: '15701',
        warehouseCustomer: 'MRF',
        warehouseSo: '15701',
        defectCustomer: 'MRF',
        defectSo: '15701',
      };
      if (station.id === 'oven') payload = prepareOvenPayload(payload, ovenSettingDefaults(order));
      return {
        requestId: randomUUID(),
        roundId,
        orderId: order.id,
        stationId: station.id,
        expectedVersion: 0,
        payload,
      };
    });
    await Promise.all(
      bodies.flatMap((body) => [svc.saveSubmission(admin, body), svc.saveSubmission(admin, body)]),
    );
    await Promise.all(Array.from({ length: 8 }, () => svc.generateReports()));
    assert.equal(
      (
        await db.database
          .prepare('SELECT COUNT(*) n FROM submissions WHERE round_id=?')
          .get(roundId)
      ).n,
      5,
    );
    assert.equal(
      (await db.database.prepare('SELECT COUNT(*) n FROM audits WHERE round_id=?').get(roundId)).n,
      5,
    );
    const reports = await db.database
      .prepare('SELECT * FROM reports WHERE round_id=?')
      .all(roundId);
    assert.equal(reports.length, 1);
    assert.match(reports[0].text, /78.75%/);
    const original = bodies.find((body) => body.stationId === 'production');
    const updates = [7, 8].map((pb) => ({
      ...original,
      requestId: randomUUID(),
      expectedVersion: 1,
      reason: 'test',
      payload: { ...original.payload, values: { ...original.payload.values, pb: String(pb) } },
    }));
    const outcomes = await Promise.allSettled(
      updates.map((body) => svc.saveSubmission(admin, body)),
    );
    assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find((result) => result.status === 'rejected').reason.status, 409);
    assert.equal(
      (
        await db.database
          .prepare('SELECT COUNT(*) n FROM requests WHERE id IN (?,?)')
          .get(...updates.map((body) => body.requestId))
      ).n,
      1,
      'losing request is rolled back',
    );
  } finally {
    await db.close();
  }
});

test('SQLite import preserves content, retries safely, and PostgreSQL dump restores correctly', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qa-pg-import-')),
    sourceFile = join(directory, 'legacy.sqlite'),
    source = new DatabaseSync(sourceFile),
    db = await openDatabase();
  try {
    source.exec(
      'CREATE TABLE workspace(id INTEGER PRIMARY KEY,owner_id TEXT,config TEXT,version INTEGER)',
    );
    source
      .prepare('INSERT INTO workspace VALUES(1,?,?,1)')
      .run(
        'legacy-owner',
        JSON.stringify({ ...DEFAULT_CONFIG, migrationNote: 'ข้อมูลเดิมภาษาไทย 6.30' }),
      );
    source.close();
    const schema = (await db.pool.query('SELECT current_schema() AS name')).rows[0].name;
    const result = await importSqlite(sourceFile, { schema });
    assert.equal(result.counts.workspace, 1);
    assert.equal((await importSqlite(sourceFile, { schema })).alreadyImported, true);
    const before = await db.database.prepare('SELECT * FROM workspace').get();
    assert.match(before.config, /ข้อมูลเดิมภาษาไทย/);
    const dump = join(directory, 'postgres.dump');
    await backupDatabase(dump, { schema });
    assert.equal((await readFile(dump)).subarray(0, 5).toString(), 'PGDMP');
    await db.pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await new Promise((done, reject) => {
      const env = postgresEnvironment(),
        child = spawn(
          process.env.PG_BIN
            ? join(
                process.env.PG_BIN,
                process.platform === 'win32' ? 'pg_restore.exe' : 'pg_restore',
              )
            : 'pg_restore',
          [
            '--no-password',
            '--no-owner',
            '--no-privileges',
            '--exit-on-error',
            '--dbname',
            env.PGDATABASE,
            dump,
          ],
          { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
        );
      let error = '';
      child.stderr.on('data', (value) => (error += value));
      child.on('error', reject);
      child.on('exit', (code) => (code === 0 ? done() : reject(new Error(error))));
    });
    assert.deepEqual(await db.database.prepare('SELECT * FROM workspace').get(), before);
  } finally {
    if (source.isOpen) source.close();
    await db.close();
    assert.ok(
      resolve(directory).startsWith(resolve(tmpdir()) + sep) &&
        directory.split(sep).at(-1).startsWith('qa-pg-import-'),
    );
    await rm(directory, { recursive: true, force: true });
  }
});
