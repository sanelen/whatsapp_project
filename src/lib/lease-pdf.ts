import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 46;
const TOP_Y = 786;
const BOTTOM_Y = 52;
const BODY_SIZE = 9.5;
const BODY_LINE_HEIGHT = 13.5;

type DrawState = {
  document: PDFDocument;
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  y: number;
};

function pdfSafeText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '');
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) lines.push(line);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      line = word;
      continue;
    }

    let fragment = '';
    for (const character of word) {
      const candidateFragment = fragment + character;
      if (font.widthOfTextAtSize(candidateFragment, size) > maxWidth && fragment) {
        lines.push(fragment);
        fragment = character;
      } else {
        fragment = candidateFragment;
      }
    }
    line = fragment;
  }

  if (line) lines.push(line);
  return lines;
}

function addPage(state: DrawState): void {
  state.page = state.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  state.y = TOP_Y;
  state.page.drawText('HAMBA TRADING PROPERTIES  |  RESIDENTIAL LEASE AGREEMENT', {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 32,
    size: 7.5,
    font: state.bold,
    color: rgb(0.09, 0.25, 0.21),
  });
  state.page.drawLine({
    start: { x: MARGIN_X, y: PAGE_HEIGHT - 39 },
    end: { x: PAGE_WIDTH - MARGIN_X, y: PAGE_HEIGHT - 39 },
    thickness: 1,
    color: rgb(0.09, 0.25, 0.21),
  });
}

function ensureSpace(state: DrawState, height: number): void {
  if (state.y - height < BOTTOM_Y) addPage(state);
}

function drawLines(
  state: DrawState,
  text: string,
  options: {
    font?: PDFFont;
    size?: number;
    lineHeight?: number;
    color?: ReturnType<typeof rgb>;
    indent?: number;
    gapBefore?: number;
    gapAfter?: number;
  } = {}
): void {
  const font = options.font ?? state.regular;
  const size = options.size ?? BODY_SIZE;
  const lineHeight = options.lineHeight ?? BODY_LINE_HEIGHT;
  const indent = options.indent ?? 0;
  const gapBefore = options.gapBefore ?? 0;
  const gapAfter = options.gapAfter ?? 4;
  const maxWidth = PAGE_WIDTH - MARGIN_X * 2 - indent;
  const lines = wrapText(pdfSafeText(text), font, size, maxWidth);

  ensureSpace(state, gapBefore + lines.length * lineHeight + gapAfter);
  state.y -= gapBefore;
  for (const line of lines) {
    state.page.drawText(line, {
      x: MARGIN_X + indent,
      y: state.y,
      size,
      font,
      color: options.color ?? rgb(0.15, 0.14, 0.12),
    });
    state.y -= lineHeight;
  }
  state.y -= gapAfter;
}

export async function createLeasePdfBytes(leaseText: string): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const state: DrawState = {
    document,
    page: document.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    regular,
    bold,
    y: PAGE_HEIGHT - 52,
  };

  const fieldLabels = new Set([
    'Property',
    'Tenant',
    'ID / passport',
    'Contact',
    'Email',
    'Occupants',
    'Commencement',
    'Lease term',
    'Monthly rent',
    'Deposit',
    'Reference',
    'Approved payment destination',
  ]);

  for (const rawLine of leaseText.split(/\n+/)) {
    const line = pdfSafeText(rawLine).trim();
    if (!line) continue;

    if (line === 'Hamba Trading Properties') {
      drawLines(state, line.toUpperCase(), {
        font: bold,
        size: 8,
        lineHeight: 11,
        color: rgb(0.71, 0.44, 0.08),
      });
    } else if (line === 'Residential lease agreement') {
      drawLines(state, line, {
        font: bold,
        size: 20,
        lineHeight: 24,
        color: rgb(0.09, 0.25, 0.21),
        gapAfter: 8,
      });
      state.page.drawLine({
        start: { x: MARGIN_X, y: state.y },
        end: { x: PAGE_WIDTH - MARGIN_X, y: state.y },
        thickness: 2,
        color: rgb(0.09, 0.25, 0.21),
      });
      state.y -= 12;
    } else if (/^\d+\.\s/.test(line)) {
      ensureSpace(state, 88);
      drawLines(state, line.toUpperCase(), {
        font: bold,
        size: 10.5,
        lineHeight: 14,
        color: rgb(0.09, 0.25, 0.21),
        gapBefore: 9,
        gapAfter: 5,
      });
    } else if (fieldLabels.has(line)) {
      drawLines(state, line.toUpperCase(), {
        font: bold,
        size: 7.5,
        lineHeight: 10,
        color: rgb(0.39, 0.36, 0.32),
        gapBefore: 2,
        gapAfter: 1,
      });
    } else if (line.startsWith('- ')) {
      drawLines(state, line, { indent: 10, gapAfter: 2 });
    } else {
      drawLines(state, line);
    }
  }

  const pages = document.getPages();
  pages.forEach((page, index) => {
    const label = `Page ${index + 1} of ${pages.length}`;
    page.drawText(label, {
      x: PAGE_WIDTH - MARGIN_X - regular.widthOfTextAtSize(label, 7.5),
      y: 25,
      size: 7.5,
      font: regular,
      color: rgb(0.42, 0.4, 0.37),
    });
  });

  return document.save();
}

export function extractLeaseText(leaseElement: HTMLElement): string {
  const blocks = leaseElement.querySelectorAll<HTMLElement>(
    'h2, h3, p, li, .lease-signature-block .border-t'
  );

  return Array.from(blocks)
    .map((block) => {
      const clone = block.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('strong').forEach((element) => {
        if (!element.textContent?.trim()) element.textContent = '____________________________';
      });
      const text = clone.textContent?.replace(/\s+/g, ' ').trim();
      return text || '____________________________';
    })
    .join('\n');
}

export async function downloadLeasePdf(leaseElement: HTMLElement, filename: string): Promise<void> {
  const bytes = await createLeasePdfBytes(extractLeaseText(leaseElement));
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filename}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
