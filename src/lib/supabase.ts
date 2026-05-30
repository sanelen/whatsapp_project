import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PromptSettings } from '@/lib/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Client-side Supabase client
export const supabaseClient = supabaseUrl && supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;

let supabaseAdmin: SupabaseClient | null = null;

// Server-side Supabase client (with service role)
export function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL required');
    }
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
  }
  return supabaseAdmin;
}

const DEFAULT_PROMPT_SETTINGS: PromptSettings = {
  id: '',
  name: 'default',
  system_prompt: 'You are a helpful assistant.',
  temperature: 0.4,
  llm_provider: 'openai',
  llm_model: 'gpt-4o',
  llm_api_key: '',
  llm_base_url: '',
  created_at: '',
  updated_at: '',
};

/** Load prompt settings directly from the database — avoids an internal HTTP round-trip. */
export async function getPromptSettings(name = 'default'): Promise<PromptSettings> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('prompt_settings')
      .select('*')
      .eq('name', name)
      .single();

    if (error) {
      // Row not yet created — return defaults
      if (error.code === 'PGRST116') return DEFAULT_PROMPT_SETTINGS;
      console.error('Prompt settings fetch error:', error.message);
      return DEFAULT_PROMPT_SETTINGS;
    }

    return data as PromptSettings;
  } catch {
    return DEFAULT_PROMPT_SETTINGS;
  }
}
