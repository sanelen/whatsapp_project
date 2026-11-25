import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const bundle = await build({
  entryPoints: ['release-tests/payments/fixture.tsx'], bundle: true, write: false,
  format: 'esm', platform: 'browser', jsx: 'automatic',
  alias: { 'next/link': resolve('release-tests/payments/next-shim.tsx'), 'next/navigation': resolve('release-tests/payments/next-shim.tsx') },
  define: { 'process.env.NODE_ENV': '"production"' },
});
const cssPath = resolve('src/app/globals.css');
const css = await postcss([tailwind()]).process(await readFile(cssPath, 'utf8'), { from: cssPath });
const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hamba Rent Follow-up — branch preview</title><link rel="stylesheet" href="/style.css"><body><div style="padding:12px;background:#0c4a6e;color:white;font:14px system-ui">Branch preview · sample balances · production is unchanged. Import and financial writes are disabled.</div><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>';
createServer((request, response) => {
  if (request.url.startsWith('/api/')) {
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'GET') response.end(JSON.stringify({ success: true, status: { configured: true } }));
    else { response.writeHead(409); response.end(JSON.stringify({ success: false, error: 'Read-only branch preview. No production records were changed.' })); }
    return;
  }
  const path = new URL(request.url, 'http://localhost').pathname;
  response.setHeader('Content-Type', path === '/fixture.js' ? 'text/javascript' : path === '/style.css' ? 'text/css' : 'text/html');
  response.end(path === '/fixture.js' ? bundle.outputFiles[0].text : path === '/style.css' ? css.css : html);
}).listen(3015, '127.0.0.1', () => console.log('Branch preview ready: http://127.0.0.1:3015/monthly-payments/follow-up?period=2026-11'));
