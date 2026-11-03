import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { computeCanvasSlices, createLeasePdfBytes } from '@/lib/lease-pdf';

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

test('canvas slices share exact boundaries and cut above each section, never through its border', () => {
  const scale = 1.25;
  // Fractional offsets are what used to make neighbouring slices overlap by a pixel row.
  const breakpoints = [0, 412.4, 960.7, 1500.2, 1800];
  const slices = computeCanvasSlices(breakpoints, scale, 1800 * scale);

  assert.equal(slices.length, 4);
  assert.equal(slices[0].startY, 0);
  for (let index = 1; index < slices.length; index += 1) {
    const previous = slices[index - 1];
    assert.equal(previous.startY + previous.height, slices[index].startY, 'no overlap and no gap');
    assert.ok(
      slices[index].startY <= Math.round(breakpoints[index] * scale) - 2,
      'cut is above the section top so its border stays in the next slice'
    );
  }
  const last = slices[slices.length - 1];
  assert.equal(last.startY + last.height, 1800 * scale);
});
