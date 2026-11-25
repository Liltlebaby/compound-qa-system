import { build } from 'vite';
import { buildServer } from './build-server.mjs';

await build();
await buildServer();
console.log('Built React client and Windows server. Run npm start or START-SERVER.cmd.');
