import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildKnowledgeStoragePath,
  normalizeChunkSettings,
  parseKnowledgeFile,
  sanitizeStorageSegment,
} from './sources';

test('sanitizeStorageSegment keeps storage paths stable', () => {
  assert.equal(sanitizeStorageSegment(' Query Heights / SAN '), 'query-heights-san');
  assert.equal(sanitizeStorageSegment(''), 'item');
});

test('buildKnowledgeStoragePath nests files by organization property and source', () => {
  assert.equal(
    buildKnowledgeStoragePath({
      organizationId: 'org_123',
      propertyId: 'prop_456',
      sourceId: 'kbsrc_789',
      fileName: 'Lease Terms.pdf',
    }),
    'org_123/prop_456/kbsrc_789/lease-terms.pdf'
  );
});

test('normalizeChunkSettings falls back to defaults on bad input', () => {
  const normalized = normalizeChunkSettings({
    chunkStrategy: 'not-real',
    chunkSize: 'bad',
    chunkOverlap: -1,
  });

  assert.equal(normalized.chunkStrategy, 'recursive_character');
  assert.equal(normalized.chunkSize, 2000);
  assert.equal(normalized.chunkOverlap, 250);
});

test('parseKnowledgeFile indexes json files as normalized text', async () => {
  const parsed = await parseKnowledgeFile({
    buffer: Buffer.from('{"property":"berea","beds":2}'),
    fileName: 'listing.json',
    mimeType: 'application/json',
  });

  assert.equal(parsed.parserStatus, 'indexed');
  assert.equal(parsed.parserType, 'json');
  assert.match(parsed.content, /"property": "berea"/);
});

test('parseKnowledgeFile marks unsupported binaries without extracted content', async () => {
  const parsed = await parseKnowledgeFile({
    buffer: Buffer.from([0, 1, 2, 3]),
    fileName: 'installer.exe',
    mimeType: 'application/octet-stream',
  });

  assert.equal(parsed.parserStatus, 'unsupported');
  assert.equal(parsed.content, '');
});
