import test from 'node:test';
import assert from 'node:assert/strict';
import { inventory, assertCoverage, exportedMethods } from '../api/coverage.mjs';
import { cases } from '../api/manifest.mjs';
test('every API method has an explicit production check', async () => assertCoverage(await inventory(), cases));
test('a newly added route cannot silently escape the deployment gate', () => assert.throws(() => assertCoverage(['GET /api/new'], []), /Uncovered: GET \/api\/new/));
test('inventory includes variable and re-exported handlers without counting comments', () => {
  assert.deepEqual(exportedMethods('// export function DELETE() {}\nexport const POST = handler; export { handler as PUT }; export async function GET() {}'), ['POST', 'PUT', 'GET']);
  assert.throws(() => exportedMethods("export * from './handlers'"), /cannot be inventoried/);
});
test('production checks have bounded duration and expose validation limits', () => {
  for (const item of cases) { assert.ok(item.budgetMs > 0 && item.budgetMs <= 60000); if (item.mode === 'validation') assert.ok(item.limitation); }
});
