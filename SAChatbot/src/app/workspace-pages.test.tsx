import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReactElement } from 'react';
import OrganizationsPage from './page';
import OrganizationPage from './organizations/[organizationId]/page';
import PropertyPage from './properties/[propertyId]/page';
import PropertyChatbotPage from './properties/[propertyId]/chatbot/page';

test('root page renders the organization starting page', () => {
  const element = OrganizationsPage() as ReactElement<{ view: string }>;

  assert.equal(element.props.view, 'organizations');
});

test('organization page renders properties for the selected organization', async () => {
  const element = await OrganizationPage({ params: Promise.resolve({ organizationId: 'org-123' }) }) as ReactElement<{
    view: string;
    organizationId: string;
  }>;

  assert.equal(element.props.view, 'organization');
  assert.equal(element.props.organizationId, 'org-123');
});

test('property page renders the chatbot workspace for the selected property', async () => {
  const element = await PropertyPage({ params: Promise.resolve({ propertyId: 'prop-123' }) }) as ReactElement<{
    view: string;
    propertyId: string;
  }>;

  assert.equal(element.props.view, 'property');
  assert.equal(element.props.propertyId, 'prop-123');
});

test('legacy chatbot URL renders the same property chatbot workspace', async () => {
  const element = await PropertyChatbotPage({ params: Promise.resolve({ propertyId: 'prop-123' }) }) as ReactElement<{
    view: string;
    propertyId: string;
  }>;

  assert.equal(element.props.view, 'chatbot');
  assert.equal(element.props.propertyId, 'prop-123');
});
