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
