import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ASSISTANT_PROVIDERS,
  DEFAULT_ASSISTANT_MODEL,
  getAssistantModel,
  getAssistantModelPricing,
} from '@/lib/assistant/model-catalog';

test('uses GPT-5.6 Luna for bounded short prospect Q&A by default', () => {
  assert.equal(DEFAULT_ASSISTANT_MODEL, 'gpt-5.6-luna');
  assert.equal(getAssistantModel('openai', '').value, 'gpt-5.6-luna');
});

test('keeps the full GPT-5.6 family in the one assistant model catalog', () => {
  const openai = ASSISTANT_PROVIDERS.find((provider) => provider.value === 'openai');
  assert.deepEqual(openai?.models.slice(0, 3).map((model) => model.value), [
    'gpt-5.6-luna',
    'gpt-5.6-terra',
    'gpt-5.6-sol',
  ]);
  assert.deepEqual(getAssistantModelPricing('gpt-5.6-luna'), { input: 1, output: 6 });
  assert.deepEqual(getAssistantModelPricing('gpt-5.6-terra'), { input: 2.5, output: 15 });
});

test('workspace picker and models API both consume the central assistant catalog', () => {
  const workspace = readFileSync('src/components/workspace/workspace-route.tsx', 'utf8');
  const modelsRoute = readFileSync('src/app/api/models/route.ts', 'utf8');
  assert.match(workspace, /ASSISTANT_PROVIDERS/);
  assert.match(modelsRoute, /ASSISTANT_PROVIDERS/);
  assert.doesNotMatch(modelsRoute, /apiKey|OPENAI_API_KEY|DEEPSEEK_API_KEY/);
});
