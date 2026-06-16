import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function parseDotEnv(text) {
  const env = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function section(title) {
  return `\n## ${title}\n`;
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    text,
    json,
  };
}

async function run() {
  const cwd = process.cwd();
  const envText = await readFile(join(cwd, '.env.local'), 'utf8');
  const fileEnv = parseDotEnv(envText);
  const env = { ...fileEnv, ...process.env };
  const baseUrl = env.APP_URL || 'http://localhost:3000';

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase environment variables required for audit.');
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const runId = `audit-${Date.now()}`;
  const auditOrgId = `audit-org-${runId}`;
  const auditPropertyId = `audit-prop-${runId}`;
  const auditOtherPropertyId = `audit-prop-other-${runId}`;
  const reportDir = join(cwd, 'docs', 'audits');
  const reportPath = join(reportDir, `vector-pipeline-${nowStamp()}.md`);

  const results = {
    startedAt: new Date().toISOString(),
    baseUrl,
    runId,
    checks: [],
    findings: [],
    sourceIds: [],
  };

  const sourceIds = {
    text: `${runId}-text`,
    txt: `${runId}-file-txt`,
    csv: `${runId}-file-csv`,
    md: `${runId}-file-md`,
    json: `${runId}-file-json`,
    pdf: `${runId}-file-pdf`,
    docx: `${runId}-file-docx`,
    xlsx: `${runId}-file-xlsx`,
    exe: `${runId}-file-exe`,
  };
  results.sourceIds = Object.values(sourceIds);

  async function cleanupSources() {
    const { data: kbRows } = await supabase
      .from('knowledge_base')
      .select('id,source_id')
      .in('source_id', Object.values(sourceIds));

    const kbIds = (kbRows || []).map((row) => row.id);
    if (kbIds.length > 0) {
      await supabase.from('knowledge_vectors').delete().in('knowledge_base_id', kbIds);
      await supabase.from('knowledge_base').delete().in('id', kbIds);
    }
  }

  function recordCheck(name, data) {
    results.checks.push({ name, ...data });
  }

  function recordFinding(severity, title, detail) {
    results.findings.push({ severity, title, detail });
  }

  await cleanupSources();

  const rootCheck = await fetchJson(`${baseUrl}/`);
  recordCheck('root-page', {
    ok: rootCheck.ok,
    status: rootCheck.status,
    containsLoadingWorkspace: rootCheck.text.includes('Loading workspace'),
  });

  const textPayload = {
    category: 'text',
    title: `Audit text source ${runId}`,
    content: [
      'Vector pipeline audit source.',
      'The unique retrieval token is HAMBACODE-ALPHA-7768.',
      'If retrieval works, search and chat should surface HAMBACODE-ALPHA-7768.',
    ].join('\n\n'),
    sourceType: 'text',
    sourceId: sourceIds.text,
    sourceName: 'Audit text source',
    overwrite: true,
    metadata: {
      auditRunId: runId,
      purpose: 'vector-pipeline-audit',
      ingestionPath: 'json-text',
    },
    tags: ['audit', 'text'],
  };

  const textUpload = await fetchJson(`${baseUrl}/api/kb/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(textPayload),
  });
  recordCheck('text-upload', {
    ok: textUpload.ok,
    status: textUpload.status,
    response: textUpload.json ?? textUpload.text,
  });

  const { data: textKbRows } = await supabase
    .from('knowledge_base')
    .select('id,title,source_id,source_type,metadata')
    .eq('source_id', sourceIds.text);
  const textKbId = textKbRows?.[0]?.id ?? null;

  const { data: textVectors } = textKbId
    ? await supabase
        .from('knowledge_vectors')
        .select('id,source_id,chunk_index,chunk_count,metadata,title,source_type')
        .eq('knowledge_base_id', textKbId)
    : { data: [] };

  recordCheck('text-db-verification', {
    knowledgeBaseRows: textKbRows?.length ?? 0,
    vectorRows: textVectors?.length ?? 0,
    sampleVector: textVectors?.[0] ?? null,
  });

  const textSearch = await fetchJson(`${baseUrl}/api/kb/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'HAMBACODE-ALPHA-7768', matchCount: 5 }),
  });
  recordCheck('text-search', {
    ok: textSearch.ok,
    status: textSearch.status,
    response: textSearch.json ?? textSearch.text,
  });

  const chatResponse = await fetchJson(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'What is the unique retrieval token in the audit knowledge?' }],
      systemPrompt: 'Answer only from retrieved knowledge. If you do not know, say so.',
    }),
  });
  recordCheck('chat-retrieval', {
    ok: chatResponse.ok,
    status: chatResponse.status,
    response: chatResponse.json ?? chatResponse.text,
  });

  const fileFixtures = [
    {
      key: 'txt',
      filename: 'audit.txt',
      mimeType: 'text/plain',
      content: 'TXT audit source. Unique token FILE-TXT-9001.',
      shouldIndexMeaningfully: true,
    },
    {
      key: 'csv',
      filename: 'audit.csv',
      mimeType: 'text/csv',
      content: 'property,token\nberea,FILE-CSV-9002\n',
      shouldIndexMeaningfully: true,
    },
    {
      key: 'md',
      filename: 'audit.md',
      mimeType: 'text/markdown',
      content: '# Audit\n\nMarkdown token FILE-MD-9003.',
      shouldIndexMeaningfully: true,
    },
    {
      key: 'json',
      filename: 'audit.json',
      mimeType: 'application/json',
      content: '{"token":"FILE-JSON-9004"}',
      shouldIndexMeaningfully: true,
    },
    {
      key: 'pdf',
      filename: 'audit.pdf',
      mimeType: 'application/pdf',
      content: '%PDF-1.4\nFake PDF token FILE-PDF-9005',
      shouldIndexMeaningfully: false,
    },
    {
      key: 'docx',
      filename: 'audit.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      content: 'Fake DOCX token FILE-DOCX-9006',
      shouldIndexMeaningfully: false,
    },
    {
      key: 'xlsx',
      filename: 'audit.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content: 'Fake XLSX token FILE-XLSX-9007',
      shouldIndexMeaningfully: false,
    },
    {
      key: 'exe',
      filename: 'audit.exe',
      mimeType: 'application/octet-stream',
      content: 'MZ fake executable token FILE-EXE-9008',
      shouldIndexMeaningfully: false,
    },
  ];

  for (const fixture of fileFixtures) {
    const multipart = new FormData();
    multipart.set('file', new Blob([fixture.content], { type: fixture.mimeType }), fixture.filename);
    multipart.set('sourceType', 'file');
    multipart.set('sourceId', sourceIds[fixture.key]);
    multipart.set('title', fixture.filename);
    multipart.set('organizationId', auditOrgId);
    multipart.set('organizationName', 'Audit Org');
    multipart.set('propertyId', auditPropertyId);
    multipart.set('propertyName', 'Audit Property');
    multipart.set('overwrite', 'true');

    const multipartResult = await fetchJson(`${baseUrl}/api/kb/upload`, {
      method: 'POST',
      body: multipart,
    });

    const multipartStoragePath =
      multipartResult.json?.data?.metadata?.storagePath ?? null;

    recordCheck(`multipart-${fixture.key}`, {
      ok: multipartResult.ok,
      status: multipartResult.status,
      storagePath: multipartStoragePath,
      parserType: multipartResult.json?.data?.metadata?.parserType ?? null,
      indexingStatus: multipartResult.json?.indexing?.status ?? null,
      response: multipartResult.json ?? multipartResult.text,
    });

    // Clean up the multipart-created row + storage object so the follow-up
    // JSON upload for the same sourceId starts clean.
    if (multipartResult.json?.data?.id) {
      await fetchJson(`${baseUrl}/api/kb/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: multipartResult.json.data.id }),
      });
    }

    const jsonUpload = await fetchJson(`${baseUrl}/api/kb/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'file',
        title: fixture.filename,
        content: fixture.content,
        sourceType: 'file',
        sourceId: sourceIds[fixture.key],
        sourceName: fixture.filename,
        overwrite: true,
        metadata: {
          auditRunId: runId,
          fileName: fixture.filename,
          fileType: fixture.mimeType,
          simulatedUpload: true,
        },
        tags: ['audit', 'file', fixture.key],
      }),
    });

    const { data: fileKbRows } = await supabase
      .from('knowledge_base')
      .select('id,source_id,source_name,metadata')
      .eq('source_id', sourceIds[fixture.key]);

    const kbId = fileKbRows?.[0]?.id ?? null;
    const { data: fileVectors } = kbId
      ? await supabase
          .from('knowledge_vectors')
          .select('id,source_id,chunk_index,metadata,content')
          .eq('knowledge_base_id', kbId)
      : { data: [] };

    recordCheck(`json-file-${fixture.key}`, {
      ok: jsonUpload.ok,
      status: jsonUpload.status,
      response: jsonUpload.json ?? jsonUpload.text,
      knowledgeBaseRows: fileKbRows?.length ?? 0,
      vectorRows: fileVectors?.length ?? 0,
      firstVectorPreview: fileVectors?.[0]?.content?.slice(0, 120) ?? null,
    });

    if (kbId) {
      const deleteResult = await fetchJson(`${baseUrl}/api/kb/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: kbId }),
      });

      const { data: kbAfterDelete } = await supabase
        .from('knowledge_base')
        .select('id')
        .eq('id', kbId);
      const { data: vectorsAfterDelete } = await supabase
        .from('knowledge_vectors')
        .select('id')
        .eq('source_id', sourceIds[fixture.key]);

      recordCheck(`delete-${fixture.key}`, {
        ok: deleteResult.ok,
        status: deleteResult.status,
        knowledgeBaseRowsAfterDelete: kbAfterDelete?.length ?? 0,
        vectorRowsAfterDelete: vectorsAfterDelete?.length ?? 0,
      });
    }
  }

  const badSearch = await fetchJson(`${baseUrl}/api/kb/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '' }),
  });
  recordCheck('edge-empty-search', {
    ok: badSearch.ok,
    status: badSearch.status,
    response: badSearch.json ?? badSearch.text,
  });

  const badChat = await fetchJson(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [] }),
  });
  recordCheck('edge-empty-chat', {
    ok: badChat.ok,
    status: badChat.status,
    response: badChat.json ?? badChat.text,
  });

  // ── Property-scope isolation test ──────────────────────────────────────────
  // Upload two text sources under different propertyIds, then search scoped to
  // one property and assert the other property's token does not leak in.
  const scopeSources = {
    primary: `${runId}-scope-primary`,
    other: `${runId}-scope-other`,
  };
  results.sourceIds.push(scopeSources.primary, scopeSources.other);

  await fetchJson(`${baseUrl}/api/kb/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: 'text', title: 'Scope primary', content: 'Primary property token SCOPE-PRIMARY-1212.',
      sourceType: 'text', sourceId: scopeSources.primary, sourceName: 'Scope primary', overwrite: true,
      metadata: { auditRunId: runId, organizationId: auditOrgId, propertyId: auditPropertyId },
      tags: ['audit', 'scope'],
    }),
  });
  await fetchJson(`${baseUrl}/api/kb/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: 'text', title: 'Scope other', content: 'Other property token SCOPE-OTHER-3434.',
      sourceType: 'text', sourceId: scopeSources.other, sourceName: 'Scope other', overwrite: true,
      metadata: { auditRunId: runId, organizationId: auditOrgId, propertyId: auditOtherPropertyId },
      tags: ['audit', 'scope'],
    }),
  });

  const scopedSearch = await fetchJson(`${baseUrl}/api/kb/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'property token', propertyId: auditPropertyId, matchCount: 10, matchThreshold: 0 }),
  });
  const scopedContents = Array.isArray(scopedSearch.json?.data)
    ? scopedSearch.json.data.map((row) => row.content || '').join(' ')
    : '';
  const scopeLeaked = scopedContents.includes('SCOPE-OTHER-3434');
  const scopeMatched = scopedContents.includes('SCOPE-PRIMARY-1212');
  recordCheck('property-scope-isolation', {
    ok: scopedSearch.ok && scopeMatched && !scopeLeaked,
    retrieval: scopedSearch.json?.retrieval ?? null,
    matchedPrimary: scopeMatched,
    leakedOther: scopeLeaked,
  });

  // Clean up scope sources.
  {
    const { data: scopeRows } = await supabase
      .from('knowledge_base')
      .select('id')
      .in('source_id', [scopeSources.primary, scopeSources.other]);
    const scopeIds = (scopeRows || []).map((row) => row.id);
    if (scopeIds.length > 0) {
      await supabase.from('knowledge_vectors').delete().in('knowledge_base_id', scopeIds);
      await supabase.from('knowledge_base').delete().in('id', scopeIds);
    }
  }

  if (!textUpload.ok) {
    recordFinding('high', 'Text ingestion failed', 'The text upload route did not complete successfully, so the current vector pipeline is not healthy.');
  }

  if (textSearch.json?.retrieval !== 'vector') {
    recordFinding('high', 'Vector retrieval did not win for text source', 'The text knowledge upload did not produce a vector-first retrieval result for a unique token search.');
  }

  if (!chatResponse.ok) {
    recordFinding('high', 'Chat route failed during KB-backed answer', 'The chat endpoint did not complete successfully when asked to answer from the uploaded audit knowledge.');
  } else if (!String(chatResponse.json?.reply || '').includes('HAMBACODE-ALPHA-7768')) {
    recordFinding('medium', 'Chat reply did not clearly surface the expected token', 'The LLM path ran, but the reply did not explicitly include the unique token, which makes retrieval validation ambiguous.');
  }

  const multipartChecks = results.checks.filter((check) => check.name.startsWith('multipart-'));
  const failedMultipart = multipartChecks.filter((check) => check.status >= 400);
  if (failedMultipart.length > 0) {
    recordFinding(
      'high',
      'Real multipart file uploads failed',
      `Multipart upload returned an error for: ${failedMultipart.map((c) => c.name).join(', ')}. The document upload pipeline is not fully working.`
    );
  }

  // Supabase Storage: every multipart upload should report a storagePath.
  const missingStorage = multipartChecks.filter((check) => check.status < 400 && !check.storagePath);
  if (missingStorage.length > 0) {
    recordFinding(
      'high',
      'Supabase Storage is not part of the file path',
      `Multipart uploads succeeded but did not return a storagePath for: ${missingStorage.map((c) => c.name).join(', ')}.`
    );
  }

  // Real parsing: supported binary docs should not be marked unsupported, and
  // unsupported binaries (exe) should be stored but flagged unsupported.
  const supportedDocs = ['multipart-pdf', 'multipart-docx', 'multipart-xlsx'];
  const misparsedDocs = multipartChecks.filter(
    (check) => supportedDocs.includes(check.name) && check.status < 400 && check.parserType && /binary|octet/.test(String(check.parserType))
  );
  if (misparsedDocs.length > 0) {
    recordFinding(
      'medium',
      'Supported document types were not parsed',
      `Expected real extraction for: ${misparsedDocs.map((c) => c.name).join(', ')}, but they were treated as opaque binaries.`
    );
  }
  const exeCheck = multipartChecks.find((check) => check.name === 'multipart-exe');
  if (exeCheck && exeCheck.status < 400 && exeCheck.indexingStatus !== 'skipped') {
    recordFinding(
      'low',
      'Unsupported binary was indexed instead of skipped',
      'An .exe fixture should be stored but marked unsupported and skipped for indexing, not embedded.'
    );
  }

  // Property scoping: scoped search must not leak another property's content.
  const scopeCheck = results.checks.find((check) => check.name === 'property-scope-isolation');
  if (scopeCheck && !scopeCheck.ok) {
    recordFinding(
      'high',
      'Retrieval is not correctly property-scoped',
      `Scoped search did not isolate by property (matchedPrimary=${scopeCheck.matchedPrimary}, leakedOther=${scopeCheck.leakedOther}). Cross-property knowledge bleed is possible.`
    );
  }

  await cleanupSources();

  const reportLines = [
    '# Vector Pipeline Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Base URL: ${baseUrl}`,
    `Run ID: ${runId}`,
    '',
    '## Summary',
    '',
    `- Checks run: ${results.checks.length}`,
    `- Findings: ${results.findings.length}`,
    '',
    '## Findings',
    '',
    ...results.findings.map((finding, index) => `${index + 1}. [${finding.severity.toUpperCase()}] ${finding.title} - ${finding.detail}`),
    section('Outputs'),
  ];

  for (const check of results.checks) {
    reportLines.push(`### ${check.name}`);
    reportLines.push('');
    reportLines.push('```json');
    reportLines.push(JSON.stringify(check, null, 2));
    reportLines.push('```');
    reportLines.push('');
  }

  await mkdir(reportDir, { recursive: true });
  await writeFile(reportPath, reportLines.join('\n'), 'utf8');

  console.log(JSON.stringify({
    reportPath,
    findings: results.findings.length,
    checks: results.checks.length,
    topFindings: results.findings.slice(0, 5),
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
