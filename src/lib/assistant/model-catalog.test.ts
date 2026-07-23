import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ASSISTANT_PROVIDERS,
  DEFAULT_ASSISTANT_MODEL,
  getAssistantModel,
  getAssistantModelPricing,
} from '@/lib/assistant/model-catalog';

test('uses GPT-5.6 Luna as the high-volume business chat default', () => {
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
});
