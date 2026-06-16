# Chat Pipeline

`src/app/api/chat/route.ts` — `POST` handler. KB-grounded chat over pluggable providers.

## Providers
- OpenAI, Anthropic, DeepSeek. DeepSeek uses the OpenAI SDK with base URL
  `https://api.deepseek.com/v1`.
- `resolveApiKey()` picks the key: **DB `prompt_settings.llm_api_key` > provider env var**.
  DeepSeek MUST resolve `DEEPSEEK_API_KEY` (historically bugged by falling through to
  `OPENAI_API_KEY` — keep separate).
- `temperature` is passed through to providers.
- Model catalog + live per-provider listing: `src/app/api/models/route.ts`.

## Grounding
- Fetches KB context and injects it. Retrieval = **vector first, text fallback** (see
  `mem:knowledge_base`). Chat labels each retrieved chunk as vector vs text fallback.
- System prompt: `DEFAULT_SYSTEM_PROMPT` constant; overridable via prompt settings
  (`src/app/api/settings/prompt/route.ts`, `getPromptSettings` in `src/lib/supabase.ts`).

## Cost / usage
- `calculateCost()` + `PRICE_IN` / `PRICE_IN_CACHED` / `PRICE_OUT` constants; `UsageShape`.
- Analytics overview: `src/lib/overview-analytics.ts`, `src/app/api/analytics/overview/route.ts`.
- Chat history: `src/app/api/history/route.ts`.
