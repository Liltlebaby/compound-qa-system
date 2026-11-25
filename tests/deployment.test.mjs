import test from 'node:test';
import assert from 'node:assert/strict';
import { safeReleasePath } from '../scripts/deployment-files.mjs';
import { extractRelease } from '../scripts/extract-release.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('release paths cannot replace data, credentials, Windows devices or escape folders', () => {
  for (const path of [
    '../data/x',
    'dist/../../data/x',
    'data/qa.dump',
    '.env.production.local',
    '.postgres/local.json',
    'runtime/node.exe',
    'dist\\..\\x',
    'dist/C:secret',
    'dist/CON',
    'dist/file.',
    'dist/a/',
    'dist/a\0b',
  ])
    assert.equal(safeReleasePath(path), false, path);
  for (const path of [
    'dist/server/index.mjs',
    'migrations/postgres/0001.sql',
    'docs/README.md',
    'START-SERVER.cmd',
  ])
    assert.equal(safeReleasePath(path), true, path);
});
test('malformed update archives are rejected before extracting', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qa-zip-'));
  try {
    const path = join(dir, 'bad.zip');
    await writeFile(path, 'not a ZIP');
    await assert.rejects(extractRelease(path, join(dir, 'output')), /Invalid ZIP/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
