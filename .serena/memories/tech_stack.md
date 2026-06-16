# Tech Stack

- **Next.js 16.2.6**, App Router, **Turbopack** (`next.config.ts` sets `turbopack.root`).
  Modified/forked Next — see `mem:core` invariant. `eslint-config-next` 16.2.6.
- **React 19.2.4** / react-dom 19.2.4. JSX runtime `react-jsx`.
- **TypeScript ^5**, `strict: true`, `moduleResolution: bundler`, `target ES2017`,
  `noEmit`. Path alias `@/*` → `./src/*`.
- **Supabase**: `@supabase/supabase-js` 2.105.3 + `@supabase/ssr` ^0.10.3. pgvector with
  `vector(768)` embeddings (HNSW cosine), `match_knowledge_vectors` RPC.
- **LLM SDKs**: `@anthropic-ai/sdk` 0.94.0, `openai` ^6.34.0. DeepSeek via OpenAI-compatible
  client (base URL `https://api.deepseek.com/v1`). Embeddings: OpenAI
  `text-embedding-3-small` with `dimensions: 768`.
- **Tailwind CSS v4** via `@tailwindcss/postcss` (`postcss.config.mjs`). Icons: `lucide-react`.
- **HeroUI v3** (`@heroui/react`) is the intended workspace component layer; prebuilt
  styles are imported from `src/app/globals.css`. `framer-motion` is installed for HeroUI.
- Document parsing deps: `pdf-parse`, `mammoth`, `xlsx`; keep them lazy-imported in server
  code and listed in `next.config.ts` `serverExternalPackages`.
- **Runtime pins**: Node `22.x`, npm `>=10` (`engines`). `packageManager: npm@10.9.7`.
  Enforced by `scripts/check-runtime.mjs` (hard exit if Node<22 / npm<10).
- **Test runner**: native `node --test` via `tsx` loader (no Jest/Vitest).
- **Serena** is installed locally and registered as a Codex MCP server for token-efficient
  memory/symbol lookup.
- Dev OS: macOS (Darwin).
