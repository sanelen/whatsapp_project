let pdfParserPromise: Promise<typeof import('pdf-parse')> | undefined;

async function loadPdfParser() {
  pdfParserPromise ??= (async () => {
    // The Node worker installs DOMMatrix, Path2D, and ImageData before pdfjs
    // evaluates. Serverless runtimes do not provide these browser globals.
    await import('pdf-parse/worker');
    return import('pdf-parse');
  })();

  return pdfParserPromise;
}

export async function extractPdfText(buffer: Buffer) {
  const { PDFParse } = await loadPdfParser();
  const parser = new PDFParse({ data: buffer });

  try {
    const parsed = await parser.getText();
    return parsed.text.trim();
  } finally {
    await parser.destroy();
  }
}
