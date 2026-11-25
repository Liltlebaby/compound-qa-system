import { openDatabase } from '../src/server/database.mjs';
import { loadEnvironment } from '../src/server/environment.mjs';
loadEnvironment();
const db = await openDatabase();
await db.close();
console.log('PostgreSQL migrations applied.');
