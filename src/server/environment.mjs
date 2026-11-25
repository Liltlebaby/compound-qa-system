import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

export function loadEnvironment(mode = process.env.QA_ENV || 'production') {
  if (!['production', 'development', 'test'].includes(mode)) throw new Error('Invalid QA_ENV');
  for (const name of [`.env.${mode}.local`, `.env.${mode}`, '.env']) {
    const file = new URL('../../' + name, import.meta.url);
    if (!existsSync(file)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
