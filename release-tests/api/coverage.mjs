import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
export function exportedMethods(text) {
  const source = ts.createSourceFile('route.ts', text, ts.ScriptTarget.Latest, true);
  const methods = new Set();
  const add = name => { if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name)) methods.add(name); };
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (!statement.exportClause) throw new Error('Wildcard route exports cannot be inventoried; export HTTP methods explicitly');
      if (ts.isNamedExports(statement.exportClause)) statement.exportClause.elements.forEach(item => add(item.name.text));
    }
    if (!statement.modifiers?.some(item => item.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name) add(statement.name.text);
    if (ts.isVariableStatement(statement)) statement.declarationList.declarations.forEach(item => { if (ts.isIdentifier(item.name)) add(item.name.text); });
  }
  return [...methods];
}
export async function inventory(root = 'src/app/api') {
  const routes = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (/^route\.[jt]s$/.test(entry.name)) {
        const text = await readFile(file, 'utf8');
        const suffix = path.relative(root, dir).split(path.sep).join('/');
        for (const method of exportedMethods(text)) routes.push(`${method} /api${suffix ? `/${suffix}` : ''}`);
      }
    }
  }
  await visit(root);
  return routes.sort();
}
export function assertCoverage(routes, cases) {
  const covered = new Set(cases.map(item => `${item.method} ${item.route}`));
  const missing = routes.filter(route => !covered.has(route));
  const stale = [...covered].filter(route => !routes.includes(route));
  if (missing.length || stale.length) throw new Error(`API coverage drift. Uncovered: ${missing.join(', ') || 'none'}. Stale: ${stale.join(', ') || 'none'}`);
}
