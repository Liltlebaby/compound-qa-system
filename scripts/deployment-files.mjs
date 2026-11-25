import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

// Only code is replaceable. Database files, credentials and backups never belong to releases.
export const releaseRoots = ['dist', 'migrations', 'docs', 'scripts/windows'];
export const releaseFiles = [
  'START-SERVER.cmd',
  'STOP-SERVER.cmd',
  'SETUP-SERVER.cmd',
  'BACKUP-DATA.cmd',
  'RESTORE-DATA.cmd',
  'CONNECT-GITHUB.cmd',
  'UPDATE-SERVER.cmd',
  'INSTALL-AUTOSTART.cmd',
  'ENABLE-MOBILE-ACCESS.cmd',
  'README-SERVER.md',
];
export function safeReleasePath(path) {
  return (
    typeof path === 'string' &&
    !/[\\\x00-\x1f<>"|?*]/.test(path) &&
    !path
      .split('/')
      .some(
        (s) =>
          !s ||
          s === '.' ||
          s === '..' ||
          s.includes(':') ||
          /[. ]$/.test(s) ||
          /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(s),
      ) &&
    (releaseFiles.includes(path) || releaseRoots.some((root) => path.startsWith(root + '/')))
  );
}
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function collectRelease(root) {
  const files = {};
  async function visit(path) {
    const entries = await readdir(join(root, path), { withFileTypes: true });
    for (const item of entries) {
      const name = path + '/' + item.name;
      if (item.isSymbolicLink()) throw new Error('Symlinks are not allowed in releases');
      if (item.isDirectory()) await visit(name);
      else files[name] = sha256(await readFile(join(root, name)));
    }
  }
  for (const dir of releaseRoots) await visit(dir);
  for (const name of releaseFiles) files[name] = sha256(await readFile(join(root, name)));
  return files;
}
export async function verifyRelease(root) {
  const manifest = JSON.parse(await readFile(join(root, 'release.json'), 'utf8'));
  if (
    manifest.product !== 'compound-qa' ||
    manifest.format !== 1 ||
    !/^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version)
  )
    throw new Error('Invalid release manifest');
  const actual = await collectRelease(root);
  for (const [name, hash] of Object.entries(manifest.files || {})) {
    if (!safeReleasePath(name) || !/^[a-f0-9]{64}$/.test(hash) || actual[name] !== hash)
      throw new Error('Release file failed verification: ' + name);
  }
  if (
    JSON.stringify(Object.keys(actual).sort()) !==
    JSON.stringify(Object.keys(manifest.files || {}).sort())
  )
    throw new Error('Release contains missing or unexpected files');
  return manifest;
}
