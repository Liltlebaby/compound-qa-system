import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { safeReleasePath } from './deployment-files.mjs';

// Restricted ZIP reader: code-only files, no links, ZIP64, encrypted data, or existing destination.
export async function extractRelease(archive, destination) {
  const bytes = await readFile(archive);
  if (bytes.length > 50 * 1024 * 1024) throw new Error('Update archive is too large');
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
    if (
      bytes.readUInt32LE(p) === 0x06054b50 &&
      p + 22 + bytes.readUInt16LE(p + 20) === bytes.length
    ) {
      end = p;
      break;
    }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6))
    throw new Error('Invalid ZIP archive');
  const count = bytes.readUInt16LE(end + 10),
    start = bytes.readUInt32LE(end + 16),
    length = bytes.readUInt32LE(end + 12);
  if (count > 3000 || count !== bytes.readUInt16LE(end + 8) || start + length !== end)
    throw new Error('Invalid ZIP directory');
  let p = start,
    total = 0;
  const entries = [],
    names = new Set();
  for (let n = 0; n < count; n++) {
    if (p + 46 > end || bytes.readUInt32LE(p) !== 0x02014b50) throw new Error('Invalid ZIP entry');
    const flags = bytes.readUInt16LE(p + 8),
      method = bytes.readUInt16LE(p + 10),
      compressed = bytes.readUInt32LE(p + 20),
      size = bytes.readUInt32LE(p + 24);
    const nameSize = bytes.readUInt16LE(p + 28),
      extraSize = bytes.readUInt16LE(p + 30),
      commentSize = bytes.readUInt16LE(p + 32),
      local = bytes.readUInt32LE(p + 42);
    const name = bytes.subarray(p + 46, p + 46 + nameSize).toString('utf8');
    if ((name !== 'release.json' && !safeReleasePath(name)) || names.has(name.toLowerCase()))
      throw new Error('Unsafe or duplicate ZIP path');
    names.add(name.toLowerCase());
    total += size;
    if (
      total > 100 * 1024 * 1024 ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      ((bytes.readUInt32LE(p + 38) >>> 16) & 0xf000) === 0xa000 ||
      bytes.readUInt16LE(p + 34)
    )
      throw new Error('Unsupported ZIP entry');
    if (local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50)
      throw new Error('Invalid ZIP local header');
    const localNameSize = bytes.readUInt16LE(local + 26),
      data = local + 30 + localNameSize + bytes.readUInt16LE(local + 28);
    if (
      bytes.subarray(local + 30, local + 30 + localNameSize).toString('utf8') !== name ||
      data + compressed > start
    )
      throw new Error('Invalid ZIP file range');
    entries.push({ name, method, size, data, compressed });
    p += 46 + nameSize + extraSize + commentSize;
  }
  if (p !== end) throw new Error('Invalid ZIP directory size');
  await mkdir(destination, { recursive: false });
  for (const e of entries) {
    const compressed = bytes.subarray(e.data, e.data + e.compressed);
    const raw =
      e.method === 8
        ? inflateRawSync(compressed, { maxOutputLength: Math.max(e.size, 1) })
        : compressed;
    if (raw.length !== e.size) throw new Error('ZIP file size mismatch');
    const file = join(destination, e.name);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, raw, { flag: 'wx' });
  }
}
