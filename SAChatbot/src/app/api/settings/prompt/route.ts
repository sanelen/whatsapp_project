import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ApiResponse, PromptSettings } from '@/lib/types';

const SETTINGS_NAME = 'default';

// GET /api/settings/prompt — fetch current prompt settings
export async function GET() {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('prompt_settings')
      .select('*')
      .eq('name', SETTINGS_NAME)
      .single();

    if (error) {
      // Row doesn't exist yet — return defaults
      if (error.code === 'PGRST116') {
        return NextResponse.json<ApiResponse<PromptSettings>>({
          success: true,
          data: {
            id: '',
            name: SETTINGS_NAME,
            system_prompt: 'You are a helpful assistant.',
            temperature: 0.4,
            llm_provider: 'openai',
            llm_model: 'gpt-5.4',
            llm_api_key: '',
            llm_base_url: '',
            created_at: '',
            updated_at: '',
          },
          timestamp: new Date().toISOString(),
        });
      }
      console.error('Prompt settings fetch error:', error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Fetch failed: ${error.message}`, timestamp: new Date().toISOString() },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<PromptSettings>>(
      { success: true, data, timestamp: new Date().toISOString() },
      { status: 200 }
    );
  } catch (err) {
    console.error('Prompt settings GET exception:', err);
    return NextResponse.json<ApiResponse>(
      { success: false, error: `Server error: ${err instanceof Error ? err.message : 'Unknown'}`, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}

// PUT /api/settings/prompt — upsert prompt settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as Partial<{
      system_prompt: string;
      temperature: number;
      llm_provider: string;
      llm_model: string;
      llm_api_key: string;
      llm_base_url: string;
    }>;

    const updates: Record<string, string | number> = {
      name: SETTINGS_NAME,
      updated_at: new Date().toISOString(),
    };

    if (typeof body.system_prompt === 'string') updates.system_prompt = body.system_prompt.slice(0, 6000);
    if (typeof body.temperature === 'number') updates.temperature = Math.min(2, Math.max(0, body.temperature));
    if (typeof body.llm_provider === 'string') updates.llm_provider = body.llm_provider.trim();
    if (typeof body.llm_model === 'string') updates.llm_model = body.llm_model.trim();
    if (typeof body.llm_api_key === 'string') updates.llm_api_key = body.llm_api_key.trim();
    if (typeof body.llm_base_url === 'string') updates.llm_base_url = body.llm_base_url.trim();

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('prompt_settings')
      .upsert(updates, { onConflict: 'name' })
      .select()
      .single();

    if (error) {
      console.error('Prompt settings upsert error:', error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Save failed: ${error.message}`, timestamp: new Date().toISOString() },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<PromptSettings>>(
      { success: true, data, timestamp: new Date().toISOString() },
      { status: 200 }
    );
  } catch (err) {
    console.error('Prompt settings PUT exception:', err);
    return NextResponse.json<ApiResponse>(
      { success: false, error: `Server error: ${err instanceof Error ? err.message : 'Unknown'}`, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
