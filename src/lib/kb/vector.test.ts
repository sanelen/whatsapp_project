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
