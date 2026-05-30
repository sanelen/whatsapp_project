// Knowledge base entry
export interface KnowledgeBase {
  id: string;
  category: string;
  title: string;
  content: string;
  tags?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Prompt settings
export interface PromptSettings {
  id: string;
  name: string;
  system_prompt: string;
  temperature: number;
  llm_provider: string;
  llm_model: string;
  llm_api_key: string;
  llm_base_url: string;
  created_at: string;
  updated_at: string;
}

// API response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}
