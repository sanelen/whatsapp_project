// Shared Supabase public connection values for the auth (SSR) clients.
// Mirrors the precedence used in src/lib/supabase.ts: publishable key first,
// falling back to the legacy anon key.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';
