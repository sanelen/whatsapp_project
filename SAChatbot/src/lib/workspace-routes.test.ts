import assert from 'node:assert/strict';
import test from 'node:test';
import { organizationPath, propertyChatbotPath, propertyPath } from './workspace-routes';

test('builds organization detail route', () => {
  assert.equal(organizationPath('org-123'), '/organizations/org-123');
});

test('builds property detail route', () => {
  assert.equal(propertyPath('prop-123'), '/properties/prop-123');
});

test('builds property chatbot settings route', () => {
  assert.equal(propertyChatbotPath('prop-123'), '/properties/prop-123/chatbot');
});
