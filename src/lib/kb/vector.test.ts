import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chunkKnowledgeText,
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KNOWLEDGE_EMBEDDING_MODEL,
} from './vector';

test('knowledge vector configuration uses OpenAI text-embedding-3 small at 768 dimensions', () => {
  assert.equal(KNOWLEDGE_EMBEDDING_MODEL, 'text-embedding-3-small');
  assert.equal(KNOWLEDGE_EMBEDDING_DIMENSIONS, 768);
});

test('chunkKnowledgeText preserves small text as one chunk', () => {
  assert.deepEqual(chunkKnowledgeText('  First policy.\n\nSecond policy.  '), ['First policy.\n\nSecond policy.']);
});

test('chunkKnowledgeText splits long text into overlapping chunks', () => {
  const chunks = chunkKnowledgeText('a'.repeat(3600), 1000, 100);
  assert.equal(chunks.length, 4);
  assert.ok(chunks.every((chunk) => chunk.length <= 1000));
});

test('chunkKnowledgeText supports sentence chunking', () => {
  const chunks = chunkKnowledgeText('One short sentence. Two short sentence. Three short sentence.', 28, 0, 'sentence');
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((chunk) => chunk.length <= 28));
});

test('chunkKnowledgeText supports markdown heading chunking', () => {
  const chunks = chunkKnowledgeText('# Title\nFirst block\n\n## Next\nSecond block', 200, 20, 'markdown');
  assert.ok(chunks.length >= 1);
  assert.match(chunks[0], /Title/);
  assert.match(chunks.join('\n'), /Next/);
});

test('empty vector matches remain healthy, while an RPC failure is reported despite text fallback', async (t) => {
  const { createClient } = await import('@supabase/supabase-js');
  const { retrieveKnowledge } = await import('./vector');
  let failRpc = false;
  let embeddingCalls = 0;
  let rpcCalls = 0;
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'api.openai.com') {
      embeddingCalls++;
      return Response.json({ data: [{ embedding: Array(768).fill(0) }] });
    }
    if (url.pathname.endsWith('/rpc/match_knowledge_vectors')) {
      rpcCalls++;
      return failRpc ? Response.json({ message: 'RPC unavailable' }, { status: 503 }) : Response.json([]);
    }
    if (url.pathname.endsWith('/knowledge_base')) return Response.json([]);
    throw new Error(`Unexpected test request ${url.pathname}`);
  });
  const admin = createClient('https://vector-test.invalid', 'test-key');
  const input = { admin, apiKey: 'test-key', query: 'No matching evidence', propertyId: 'property-1' };
  assert.deepEqual(await retrieveKnowledge(input), { retrieval: 'text', vectorStatus: 'available', results: [] });
  failRpc = true;
  assert.deepEqual(await retrieveKnowledge(input), { retrieval: 'text', vectorStatus: 'unavailable', results: [] });
  assert.equal(embeddingCalls, 2);
  assert.equal(rpcCalls, 2);
});
