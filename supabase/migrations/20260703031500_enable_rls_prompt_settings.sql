-- FR-5.3: prompt_settings stores LLM API keys. All application access goes
-- through the service-role client (src/lib/supabase.ts getSupabaseAdmin), which
-- bypasses RLS, so enabling RLS with no anon/authenticated policies closes the
-- public exposure without any app change. Grants are revoked as defense in depth.
--
-- Applied to live project ddlykzackuehdexldazv on 2026-07-03 (nightly run).
-- Verified: anon role denied (42501), service_role reads normally.
alter table public.prompt_settings enable row level security;
revoke all on table public.prompt_settings from anon, authenticated;
