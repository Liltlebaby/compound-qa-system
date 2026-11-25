import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = new URL('../src/', import.meta.url);
const violations = [];

async function check(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(item.name + (item.isDirectory() ? '/' : ''), directory);
    if (item.isDirectory()) {
      await check(url);
      continue;
    }
    if (!/\.(mjs|tsx?)$/.test(item.name)) continue;
    const file = fileURLToPath(url);
    const relative = url.href.slice(source.href.length);
    const parsed = ts.createSourceFile(file, await readFile(url, 'utf8'), ts.ScriptTarget.Latest);
    for (const statement of parsed.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith('.')) continue;
      const target = new URL(specifier, url).href.slice(source.href.length);
      const allowed = relative.startsWith('shared/')
        ? target.startsWith('shared/')
        : relative.startsWith('server/')
          ? target.startsWith('shared/') || target.startsWith('server/')
          : !target.startsWith('server/') &&
            (!relative.startsWith('features/') || !target.startsWith('app/'));
      if (!allowed) violations.push(`${relative}: cannot import ${specifier}`);
    }
  }
}

await check(source);
if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Module boundaries passed: shared, server, features, and app.');
}
