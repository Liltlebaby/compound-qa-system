import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { collectRelease, sha256 } from './deployment-files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = process.argv[2];
if (!/^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version || ''))
  throw new Error('Usage: node scripts/package-release.mjs v1.0.0 [output-directory]');
const output = resolve(process.argv[3] || join(root, 'release-artifacts'));
await mkdir(output, { recursive: true });
const files = await collectRelease(root);
const manifest = {
  product: 'compound-qa',
  format: 1,
  version,
  nodeMajor: 24,
  postgresMajor: 18,
  createdAt: new Date().toISOString(),
  files,
};
await writeFile(join(root, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');

// Standard ZIP/deflate, with no third-party runtime dependency on the server.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const b of buffer) {
    crc ^= b;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
let offset = 0;
const blocks = [],
  central = [];
for (const path of [...Object.keys(files), 'release.json'].sort()) {
  const raw = await readFile(join(root, path)),
    compressed = deflateRawSync(raw),
    name = Buffer.from(path);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(33, 12);
  header.writeUInt32LE(crc32(raw), 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(raw.length, 22);
  header.writeUInt16LE(name.length, 26);
  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50);
  record.writeUInt16LE(20, 4);
  header.copy(record, 6, 4, 30);
  record.writeUInt32LE(offset, 42);
  blocks.push(header, name, compressed);
  central.push(record, name);
  offset += header.length + name.length + compressed.length;
}
const directory = Buffer.concat(central),
  tail = Buffer.alloc(22);
tail.writeUInt32LE(0x06054b50);
tail.writeUInt16LE(blocks.length / 3, 8);
tail.writeUInt16LE(blocks.length / 3, 10);
tail.writeUInt32LE(directory.length, 12);
tail.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...blocks, directory, tail]),
  name = 'compound-qa-update.zip';
await writeFile(join(output, name), zip);
await writeFile(join(output, name + '.sha256'), sha256(zip) + '  ' + name + '\n');
console.log('Packaged ' + version + ': ' + zip.length + ' bytes (code only)');
