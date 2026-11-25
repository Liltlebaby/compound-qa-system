import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile, readdir } from 'node:fs/promises';
import { Pool, types } from 'pg';
import { ApiError } from '../shared/access.mjs';

// Existing API counters are JS numbers; never silently truncate PostgreSQL bigint values.
types.setTypeParser(20, (value) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Database counter exceeds safe integer range');
  return number;
});

/** Convert positional placeholders, leaving quoted strings and identifiers intact. */
export function parameterize(sql) {
  let quote = '',
    result = '',
    index = 0;
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (quote) {
      result += char;
      if (char === quote) {
        if (sql[i + 1] === quote) result += sql[++i];
        else quote = '';
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      result += char;
    } else result += char === '?' ? '$' + ++index : char;
  }
  return result;
}

export async function openDatabase({
  connectionString = process.env.DATABASE_URL,
  schema = process.env.QA_DB_SCHEMA || 'public',
  migrations = new URL('../../migrations/postgres/', import.meta.url),
} = {}) {
  if (!connectionString)
    throw new Error(
      'DATABASE_URL is required. Configure .env.development.local or .env.production.local for PostgreSQL.',
    );
  if (!/^(public|qa_test_[a-f0-9]+)$/.test(schema)) throw new Error('Invalid database schema');
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    options: '-c search_path=' + schema,
    application_name: 'compound-qa',
  });
  pool.on('error', (error) =>
    console.error('PostgreSQL idle connection error:', error.code || 'connection lost'),
  );
  const context = new AsyncLocalStorage();
  const query = (sql, args = []) => (context.getStore() || pool).query(parameterize(sql), args);

  async function transaction(action, locks = []) {
    if (context.getStore()) {
      for (const key of [...new Set(locks)].sort())
        await context
          .getStore()
          .query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
      return action();
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '10s'");
      for (const key of [...new Set(locks)].sort())
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
      const result = await context.run(client, action);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  class NativeStatement {
    constructor(sql) {
      this.sql = sql;
    }
    async get(...args) {
      return (await query(this.sql, args)).rows[0];
    }
    async all(...args) {
      return (await query(this.sql, args)).rows;
    }
    async run(...args) {
      return { changes: (await query(this.sql, args)).rowCount };
    }
  }
  class Prepared {
    constructor(sql, args = []) {
      this.sql = sql;
      this.args = args;
    }
    bind(...args) {
      return new Prepared(this.sql, args);
    }
    async all() {
      return { results: (await query(this.sql, this.args)).rows };
    }
    async run() {
      return { meta: { changes: (await query(this.sql, this.args)).rowCount } };
    }
  }
  const adapter = {
    transaction,
    prepare: (sql) => new Prepared(sql),
    async batch(statements, { lockKeys = [], requireChanges = [] } = {}) {
      return transaction(async () => {
        const results = [];
        for (const [index, statement] of statements.entries()) {
          const result = await statement.run();
          if (requireChanges.includes(index) && !result.meta.changes)
            throw new ApiError(
              409,
              'ข้อมูลเปลี่ยนจากเครื่องอื่น กรุณาโหลดล่าสุดและตรวจทานอีกครั้ง',
            );
          results.push(result);
        }
        return results;
      }, lockKeys);
    },
  };
  const database = {
    prepare: (sql) => new NativeStatement(sql),
    exec: (sql) => query(sql),
    transaction,
    close: () => pool.end(),
  };
  try {
    await transaction(async () => {
      if (schema !== 'public') await query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      await query(
        'CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at text NOT NULL)',
      );
      for (const name of (await readdir(migrations)).filter((n) => n.endsWith('.sql')).sort()) {
        if (await database.prepare('SELECT name FROM _migrations WHERE name=?').get(name)) continue;
        await query(await readFile(new URL(name, migrations), 'utf8'));
        await database
          .prepare('INSERT INTO _migrations VALUES (?,?)')
          .run(name, new Date().toISOString());
      }
    }, ['compound-qa:migrations:' + schema]);
    return { database, adapter, pool, close: database.close };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
