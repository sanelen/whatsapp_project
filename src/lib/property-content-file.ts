import path from 'node:path';

export const PROPERTY_IMPORT_MAX_BYTES = 5_000_000;

export type ParsedPropertyContentFile = {
  format: 'csv' | 'json' | 'xlsx';
  rows: Array<Record<string, unknown>>;
};

function assertPlainRows(value: unknown): Array<Record<string, unknown>> {
  const candidates = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { rows?: unknown }).rows)
      ? (value as { rows: unknown[] }).rows
      : [];
  return candidates.slice(0, 250).map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`Structured row ${index + 1} must be an object.`);
    }
    return Object.fromEntries(
      Object.entries(row as Record<string, unknown>)
        .filter(([key]) => key !== '__proto__' && key !== 'constructor' && key !== 'prototype')
    );
  });
}

export async function parsePropertyContentFile(file: File): Promise<ParsedPropertyContentFile> {
  if (file.size > PROPERTY_IMPORT_MAX_BYTES) {
    throw new Error('Structured imports are limited to 5 MB.');
  }
  const extension = path.extname(file.name).toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (extension === '.json' || file.type === 'application/json') {
    let decoded: unknown;
    try {
      decoded = JSON.parse(buffer.toString('utf8'));
    } catch {
      throw new Error('The JSON file is not valid JSON.');
    }
    return { format: 'json', rows: assertPlainRows(decoded) };
  }

  if (!['.csv', '.xlsx', '.xls'].includes(extension)) {
    throw new Error('Use a CSV, JSON, XLS, or XLSX structured file.');
  }

  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    cellText: true,
    sheetRows: 251,
  });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return { format: extension === '.csv' ? 'csv' : 'xlsx', rows: [] };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], {
    defval: '',
    raw: false,
  });
  return {
    format: extension === '.csv' ? 'csv' : 'xlsx',
    rows: assertPlainRows(rows),
  };
}
