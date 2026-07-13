import { randomUUID } from 'node:crypto';
import { extractPdfText } from '../pdf-text';

// Heavy/native-ish parsers are imported lazily inside their branches. Importing
// `pdf-parse` (which pulls in `pdfjs-dist`) at module scope crashes the whole
// route at load time in the Next server runtime, taking down even plain-text
// uploads. Loading them on demand keeps the module safe to import.

export const DEFAULT_UPLOADS_BUCKET = 'uploads';
export const DEFAULT_KB_CHUNK_SIZE = 2000;
export const DEFAULT_KB_CHUNK_OVERLAP = 250;

export type ChunkStrategy = 'recursive_character' | 'sentence' | 'latex' | 'markdown' | 'character';

export type ParsedKnowledgeFile = {
  content: string;
  extension: string;
  mimeType: string;
  parserStatus: 'indexed' | 'unsupported';
  parserType: string;
};

type ParseKnowledgeFileInput = {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
};

export function createKnowledgeSourceId() {
  return `kbsrc_${randomUUID()}`;
}

export function sanitizeStorageSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'item';
}

export function buildKnowledgeStoragePath(input: {
  organizationId: string;
  propertyId: string;
  sourceId: string;
  fileName: string;
}) {
  return [
    sanitizeStorageSegment(input.organizationId),
    sanitizeStorageSegment(input.propertyId),
    sanitizeStorageSegment(input.sourceId),
    sanitizeStorageSegment(input.fileName),
  ].join('/');
}

export function normalizeChunkSettings(input: {
  chunkStrategy?: unknown;
  chunkSize?: unknown;
  chunkOverlap?: unknown;
}): {
  chunkStrategy: ChunkStrategy;
  chunkSize: number;
  chunkOverlap: number;
} {
  const chunkStrategy = input.chunkStrategy;
  const chunkSize = Number(input.chunkSize);
  const chunkOverlap = Number(input.chunkOverlap);

  return {
    chunkStrategy:
      chunkStrategy === 'sentence' ||
      chunkStrategy === 'latex' ||
      chunkStrategy === 'markdown' ||
      chunkStrategy === 'character' ||
      chunkStrategy === 'recursive_character'
        ? chunkStrategy
        : 'recursive_character',
    chunkSize: Number.isFinite(chunkSize) && chunkSize > 0 ? Math.round(chunkSize) : DEFAULT_KB_CHUNK_SIZE,
    chunkOverlap:
      Number.isFinite(chunkOverlap) && chunkOverlap >= 0 ? Math.round(chunkOverlap) : DEFAULT_KB_CHUNK_OVERLAP,
  };
}

export async function parseKnowledgeFile(input: ParseKnowledgeFileInput): Promise<ParsedKnowledgeFile> {
  const extension = input.fileName.includes('.') ? input.fileName.split('.').pop()?.toLowerCase() || '' : '';
  const mimeType = (input.mimeType || '').toLowerCase();

  if (extension === 'txt' || extension === 'md' || extension === 'markdown' || extension === 'csv') {
    return {
      content: input.buffer.toString('utf8').trim(),
      extension,
      mimeType,
      parserStatus: 'indexed',
      parserType: extension === 'csv' ? 'csv_text' : extension === 'txt' ? 'plain_text' : 'markdown_text',
    };
  }

  if (extension === 'json') {
    try {
      const parsed = JSON.parse(input.buffer.toString('utf8'));
      return {
        content: JSON.stringify(parsed, null, 2),
        extension,
        mimeType,
        parserStatus: 'indexed',
        parserType: 'json',
      };
    } catch {
      return {
        content: input.buffer.toString('utf8').trim(),
        extension,
        mimeType,
        parserStatus: 'indexed',
        parserType: 'json_text',
      };
    }
  }

  if (extension === 'html' || extension === 'htm') {
    const html = input.buffer.toString('utf8');
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      content: stripped,
      extension,
      mimeType,
      parserStatus: 'indexed',
      parserType: 'html_text',
    };
  }

  if (extension === 'pdf') {
    try {
      return {
        content: await extractPdfText(input.buffer),
        extension,
        mimeType,
        parserStatus: 'indexed',
        parserType: 'pdf',
      };
    } catch (error) {
      return unparseableFile(extension, mimeType, 'pdf', error);
    }
  }

  if (extension === 'docx') {
    try {
      const { default: mammoth } = await import('mammoth');
      const parsed = await mammoth.extractRawText({ buffer: input.buffer });
      return {
        content: parsed.value.trim(),
        extension,
        mimeType,
        parserStatus: 'indexed',
        parserType: 'docx',
      };
    } catch (error) {
      return unparseableFile(extension, mimeType, 'docx', error);
    }
  }

  if (extension === 'xlsx' || extension === 'xls') {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(input.buffer, { type: 'buffer' });
      const content = workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet).trim();
        return csv ? `# ${sheetName}\n${csv}` : '';
      })
        .filter(Boolean)
        .join('\n\n');

      return {
        content,
        extension,
        mimeType,
        parserStatus: 'indexed',
        parserType: 'xlsx',
      };
    } catch (error) {
      return unparseableFile(extension, mimeType, 'xlsx', error);
    }
  }

  return {
    content: '',
    extension,
    mimeType,
    parserStatus: 'unsupported',
    parserType: extension || mimeType || 'binary',
  };
}

/**
 * A corrupt or otherwise unreadable file should still be stored — it is simply
 * flagged unsupported so the caller skips embedding rather than failing the
 * whole upload.
 */
function unparseableFile(
  extension: string,
  mimeType: string,
  parserType: string,
  error: unknown
): ParsedKnowledgeFile {
  console.error(`Failed to parse ${parserType} file:`, error);
  return {
    content: '',
    extension,
    mimeType,
    parserStatus: 'unsupported',
    parserType,
  };
}
