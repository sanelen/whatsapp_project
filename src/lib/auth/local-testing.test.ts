import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getLocalAuthBypassEmail,
  getLocalAuthBypassUser,
  parseEnvToggle,
} from './local-testing';

test('parseEnvToggle accepts common enabled values', () => {
  assert.equal(parseEnvToggle('true'), true);
  assert.equal(parseEnvToggle('TRUE'), true);
  assert.equal(parseEnvToggle('1'), true);
  assert.equal(parseEnvToggle('yes'), true);
  assert.equal(parseEnvToggle('on'), true);
});

test('parseEnvToggle rejects missing and disabled values', () => {
  assert.equal(parseEnvToggle(undefined), false);
  assert.equal(parseEnvToggle(''), false);
  assert.equal(parseEnvToggle('false'), false);
  assert.equal(parseEnvToggle('0'), false);
  assert.equal(parseEnvToggle('off'), false);
});

test('getLocalAuthBypassUser returns a stable local testing identity', () => {
  const user = getLocalAuthBypassUser();

  assert.equal(user.id, 'local-auth-bypass-user');
  assert.equal(user.email, getLocalAuthBypassEmail());
  assert.equal(user.role, 'authenticated');
  assert.equal(user.app_metadata.provider, 'local-auth-bypass');
});
