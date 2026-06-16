import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Keep document parsers out of the server bundle. `pdf-parse`/`pdfjs-dist`
  // break when bundled and must be required at runtime from node_modules.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'mammoth', 'xlsx'],
};

export default nextConfig;
