import { randomBytes } from 'node:crypto';
import { openDatabase as openPostgres } from '../../src/server/database.mjs';
import { loadEnvironment } from '../../src/server/environment.mjs';

loadEnvironment('development');
export async function openDatabase() {
  const schema = 'qa_test_' + randomBytes(12).toString('hex');
  const result = await openPostgres({ schema });
  const close = async () => {
    if (!/^qa_test_[a-f0-9]{24}$/.test(schema)) throw new Error('Refuse to remove non-test schema');
    await result.pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await result.close();
  };
  return { ...result, database: { ...result.database, close }, close };
}
