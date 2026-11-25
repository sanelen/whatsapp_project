import { createHash, createHmac } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { cases, dependencies } from './manifest.mjs';
import { inventory, assertCoverage } from './coverage.mjs';

assertCoverage(await inventory(), cases);
const base = process.env.RELEASE_BASE_URL;
const revision = process.env.RELEASE_EXPECTED_SHA;

let property = process.env.RELEASE_PROPERTY_ID;
const now = new Date();
if (now.getUTCDate() >= 9) now.setUTCMonth(now.getUTCMonth() + 1, 1);
const period = process.env.RELEASE_BILLING_PERIOD || now.toISOString().slice(0, 7);
const report = { revision, base, checkedAt: new Date().toISOString(), dependencies, checks: [] };
let lastJob;
function needed(name) { const value = process.env[name]; if (!value) throw new Error(`Missing required credential/configuration: ${name}`); return value; }
function replace(value) { return JSON.parse(JSON.stringify(value).replaceAll('$PROPERTY', property ?? '').replaceAll('$PERIOD', period)); }
function shape(value, rule) {
  if (!rule) return;
  const [key, type] = rule.split(':'); const actual = value?.[key];
  if (type === 'array' ? !Array.isArray(actual) : type === 'true' ? actual !== true : typeof actual !== type || actual === null) throw new Error(`Invalid response: expected ${key}:${type}`);
}
async function request(item, extra = {}) {
  const headers = { ...extra.headers };
  let body = extra.body ?? (item.body ? JSON.stringify(replace(item.body)) : undefined);
  if (body) headers['content-type'] = 'application/json';
  const url = new URL(replace(item.route + (extra.query ?? item.query ?? '')), needed('RELEASE_BASE_URL'));
  const timestamp = String(Date.now());
  headers['x-hamba-check-time'] = timestamp;
  headers['x-hamba-check-signature'] = createHmac('sha256', needed('RELEASE_CHECK_SECRET')).update(`${timestamp}\n${item.method}\n${url.pathname}${url.search}\n${createHash('sha256').update(body ?? '').digest('hex')}`).digest('hex');
  const start = performance.now();
  const response = await fetch(url, { method: item.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(item.budgetMs) });
  const text = await response.text();
  const durationMs = Math.round(performance.now() - start);
  if (response.status !== item.status) {
    const detail = item.route === '/api/release-check' ? JSON.parse(text).error : undefined;
    throw new Error(`HTTP ${response.status}; expected ${item.status}; ${durationMs}ms${detail ? `; ${detail}` : ''}`);
  }
  if (response.headers.get('x-hamba-revision') !== needed('RELEASE_EXPECTED_SHA')) throw new Error('Response revision differs from deployment SHA');
  if (durationMs > item.budgetMs) throw new Error(`Duration ${durationMs}ms exceeds ${item.budgetMs}ms`);
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (item.error && !data.error?.includes(item.error)) throw new Error('Expected validation error was not returned');
  shape(data, item.shape);
  return { data, durationMs };
}
async function terminal(runId) {
  const start = performance.now();
  let polls = 0;
  for (;;) {
    const { data } = await request({ method: 'GET', route: '/api/monthly-payments/import', status: 200, budgetMs: 15000 }, { query: `?runId=${encodeURIComponent(runId)}` });
    polls++;
    if (!data.queued) {
      if (!data.success || data.status !== 'completed' || !data.verification?.dryRun) throw new Error(`Import verification ${data.status}; failed steps: ${(data.persistedSteps ?? []).filter(step => step.status === 'failed').map(step => step.name.split('//').at(-1)).join(', ') || 'unknown'}`);
      const proof = data.verification;
      if (!(proof.sources?.mailboxes > 0) || !(proof.evidence?.verified > 0) || !Number.isInteger(proof.matching?.scanned) || proof.matching?.failed !== 0) throw new Error('Import source/evidence/matching verification is incomplete');
      if (!['verifySources', 'verifyEvidence', 'verifyMatching'].every(name => data.persistedSteps?.some(step => step.name.endsWith(name) && step.status === 'completed'))) throw new Error('Durable source, evidence and matching steps were not persisted');
      return { polls, terminalMs: Math.round(performance.now() - start), evidenceFiles: proof.evidence.verified, matchingScanned: proof.matching.scanned };
    }
    if (performance.now() - start > 180000) throw new Error('Durable import did not reach terminal success within 180 seconds');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
// Main-branch fallback when the hosting provider delays its deployment event.
// This readiness read has no credentials or mutations; the API checks remain signed.
let deploymentReady = true;
if (process.env.RELEASE_WAIT_FOR_DEPLOYMENT === 'true') {
  deploymentReady = false;
  const deadline = Date.now() + 600000;
  let reason = 'Expected revision is not live';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL('/api/whatsapp/webhook', needed('RELEASE_BASE_URL')), { redirect: 'manual', signal: AbortSignal.timeout(15000) });
      await response.arrayBuffer();
      if (response.headers.get('x-hamba-revision') === needed('RELEASE_EXPECTED_SHA')) { deploymentReady = true; break; }
      reason = `Expected revision is not live (HTTP ${response.status})`;
    } catch { reason = 'Production readiness request failed'; }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  if (!deploymentReady) {
    report.checks.push({ route: '/api/whatsapp/webhook', method: 'GET', mode: 'deployment-readiness', status: 'failed', reason });
    console.error(`FAILED deployment readiness: ${reason}`);
  }
}
for (const item of (deploymentReady ? [...cases] : []).sort((a, b) => Number(a.mode === 'job-status') - Number(b.mode === 'job-status'))) {
  const check = { route: item.route, method: item.method, mode: item.mode, limitation: item.limitation };
  try {
    needed('RELEASE_BASE_URL'); needed('RELEASE_EXPECTED_SHA'); needed('RELEASE_CHECK_SECRET');
    if (JSON.stringify(item).includes('$PROPERTY') && !property) {
      const { data } = await request({ method: 'POST', route: '/api/release-check', body: { probe: 'configuration' }, status: 200, budgetMs: 15000 });
      if (!data.success || typeof data.propertyId !== 'string' || !data.propertyId) throw new Error('Production release property scope is missing');
      property = data.propertyId;
    }
    let extra = {};
    if (['webhook-challenge', 'signed-webhook', 'encrypted-ping'].includes(item.mode)) {
      const probe = item.mode === 'webhook-challenge' ? 'webhook-get' : item.mode === 'signed-webhook' ? 'webhook-post' : 'flow-ping';
      const { data, durationMs } = await request({ method: 'POST', route: '/api/release-check', status: 200, body: { probe }, budgetMs: 30000 });
      if (!data.success || !['verified', 'disabled'].includes(data.state)) throw new Error('Provider probe did not verify the route');
      check.status = data.state === 'disabled' ? 'disabled' : 'passed';
      check.durationMs = durationMs;
      check.limitation = data.limitation;
      report.checks.push(check);
      console.log(`${check.status.toUpperCase()} ${check.method} ${check.route}: ${durationMs}ms`);
      continue;
    }
    if (item.mode === 'job-status') {
      if (!lastJob) throw new Error('No verified import job available');
      extra.query = `?runId=${encodeURIComponent(lastJob)}`;
    }
    const { data, durationMs } = await request(item, extra);
    check.durationMs = durationMs;
    if (item.mode === 'workflow') {
      if (!data.queued || !data.workflowRunId) throw new Error('Import was not durably queued');
      lastJob = data.workflowRunId;
      Object.assign(check, await terminal(lastJob));
    }
    if (item.route === '/api/chat' && !/^READY[.!]?$/i.test(data.reply?.trim())) throw new Error('Chat did not return the requested READY response');
    if (item.route === '/api/kb/search') {
      check.retrieval = data.retrieval;
      check.vectorStatus = data.vectorStatus;
      if (data.vectorStatus !== 'available') throw new Error('Embedding/vector integration failed; text fallback is active');
      if (data.retrieval === 'text') check.limitation = 'Embedding and vector RPC succeeded with no semantic matches; scoped text fallback was used.';
    }
    if (item.route === '/api/monthly-payments/import/google-cloud' && !data.status.configured) throw new Error('Google Cloud is not configured');
    check.status = 'passed';
  } catch (error) {
    check.status = 'failed';
    // Never write response bodies, signed URLs, cookies, tokens or tenant data.
    check.reason = error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, '[url]') : 'Check failed';
  }
  report.checks.push(check);
  console.log(`${check.status.toUpperCase()} ${check.method} ${check.route}: ${check.reason ?? `${check.durationMs}ms (${check.mode})`}`);
}
await mkdir('test-results', { recursive: true });
await writeFile('test-results/production-api.json', JSON.stringify(report, null, 2));
process.exitCode = report.checks.some(check => check.status === 'failed') ? 1 : 0;
