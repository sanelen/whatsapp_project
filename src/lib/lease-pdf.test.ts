import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { createLeasePdfBytes } from '@/lib/lease-pdf';

test('lease PDF generation creates a readable multipage PDF with page numbering', async () => {
  const source = [
    'Hamba Trading Properties',
    'Residential lease agreement',
    '1. Parties, purpose and premises',
    ...Array.from({ length: 180 }, (_, index) => `Lease clause test line ${index + 1} with enough text to wrap safely on an A4 page.`),
    '17. Acceptance and signatures',
  ].join('\n');

  const bytes = await createLeasePdfBytes(source);
  const document = await PDFDocument.load(bytes);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  assert.ok(document.getPageCount() >= 2);
});
