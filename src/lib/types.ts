// Knowledge base entry
export interface KnowledgeBase {
  id: string;
  category: string;
  title: string;
  content: string;
  tags?: string[];
  is_active: boolean;
  source_type?: string;
  source_id?: string | null;
  source_name?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeIndexingStatus {
  status: 'indexed' | 'skipped' | 'failed';
  chunkCount: number;
  model: string;
  dimensions: number;
  error?: string;
}

export interface KnowledgeSearchResult {
  id: string;
  category: string;
  title: string;
  content: string;
  source_type?: string;
  source_name?: string;
  chunk_index?: number;
  metadata?: Record<string, unknown>;
  similarity?: number;
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
