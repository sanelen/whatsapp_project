import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
  // Keep document parsers out of the server bundle. `pdf-parse`/`pdfjs-dist`
  // break when bundled and must be required at runtime from node_modules.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'mammoth', 'xlsx'],
};

export default nextConfig;
