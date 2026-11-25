import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { rolldown } from 'rolldown';
import { builtinModules } from 'node:module';

const project = new URL('../', import.meta.url);

/** Both source and runtime use the same server/shared relative module paths. */
export async function buildServer() {
  for (const directory of ['server', 'shared']) {
    const source = new URL(`src/${directory}/`, project);
    const output = new URL(`dist/${directory}/`, project);
    await mkdir(output, { recursive: true });

    for (const name of await readdir(source)) {
      if (!name.endsWith('.mjs') && !(directory === 'server' && name.endsWith('.ts'))) continue;
      const text = await readFile(new URL(name, source), 'utf8');
      const content = name.endsWith('.ts')
        ? ts.transpileModule(text, {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
          }).outputText
        : text;
      await writeFile(new URL(name.replace(/\.ts$/, '.mjs'), output), content);
    }
  }
  const bundle = await rolldown({
    input: fileURLToPath(new URL('src/server/index.mjs', project)),
    platform: 'node',
    external: (id) => id.startsWith('node:') || builtinModules.includes(id) || id === 'pg-native',
    plugins: [
      {
        name: 'typescript-service',
        resolveId(id, importer) {
          if (id === './service.mjs' && importer?.endsWith('index.mjs'))
            return fileURLToPath(new URL('src/server/service.ts', project));
        },
      },
    ],
  });
  try {
    await bundle.write({
      file: fileURLToPath(new URL('dist/server/index.mjs', project)),
      format: 'esm',
    });
  } finally {
    await bundle.close();
  }
  const local = await rolldown({
    input: fileURLToPath(new URL('scripts/postgres-local.mjs', project)),
    platform: 'node',
    external: (id) => id.startsWith('node:') || builtinModules.includes(id) || id === 'pg-native',
  });
  try {
    await local.write({
      file: fileURLToPath(new URL('dist/postgres-local.mjs', project)),
      format: 'esm',
      codeSplitting: false,
    });
  } finally {
    await local.close();
  }
  const tools = await rolldown({
    input: fileURLToPath(new URL('scripts/server-tools.mjs', project)),
    platform: 'node',
    external: (id) => id.startsWith('node:') || builtinModules.includes(id) || id === 'pg-native',
  });
  try {
    await tools.write({
      file: fileURLToPath(new URL('dist/server-tools.mjs', project)),
      format: 'esm',
      codeSplitting: false,
    });
  } finally {
    await tools.close();
  }
  await writeFile(
    new URL('dist/start.mjs', project),
    "import {startLocalPostgres} from './postgres-local.mjs';\nawait startLocalPostgres();\nawait import('./server/index.mjs');\n",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildServer();
  console.log('Server built: dist/server/index.mjs');
}
