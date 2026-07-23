import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_ASSISTANT_GREETING, replaceAssistantGreeting, resolveAssistantGreeting } from '@/lib/assistant/defaults';

test('replaces the legacy welcome placeholder with the natural shared greeting', () => {
  assert.equal(resolveAssistantGreeting(['Welcome message']), DEFAULT_ASSISTANT_GREETING);
});

test('preserves other WhatsApp templates when updating the shared greeting', () => {
  assert.deepEqual(replaceAssistantGreeting(['Old greeting', 'Viewing reminder'], 'New greeting'), ['New greeting', 'Viewing reminder']);
});
