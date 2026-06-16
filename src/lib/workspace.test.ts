import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addOrganization,
  addProperty,
  createSeedWorkspace,
  deleteOrganization,
  deleteProperty,
  getPropertiesForOrganization,
  getWorkspaceSummary,
  mapWorkspaceRows,
  normalizeOrganizationIcon,
  updateOrganization,
  updatePropertyChatbot,
  updateProperty,
} from './workspace';

test('seed workspace creates a parent organization with child properties', () => {
  const workspace = createSeedWorkspace();
  const organization = workspace.organizations[0];
  const properties = getPropertiesForOrganization(workspace, organization.id);

  assert.equal(workspace.organizations.length, 1);
  assert.equal(properties.length, 2);
  assert.equal(properties[0].organizationId, organization.id);
  assert.equal(properties[0].chatbot.retrievalTopK, 5);
});

test('adding an organization creates a parent card with a UUID-style id', () => {
  const workspace = createSeedWorkspace();
  const next = addOrganization(workspace, {
    name: 'New Parent',
    icon: 'np',
    description: 'New organization',
  });

  assert.equal(next.organizations.length, workspace.organizations.length + 1);
  assert.match(next.organizations[0].id, /^org_/);
  assert.equal(next.organizations[0].icon, 'NP');
});

test('organization icons preserve uploaded image data urls', () => {
  const imageIcon = 'data:image/png;base64,abc123';

  assert.equal(normalizeOrganizationIcon(imageIcon), imageIcon);
  assert.equal(normalizeOrganizationIcon('hamba'), 'HAMB');
});

test('organization details can be updated independently', () => {
  const workspace = createSeedWorkspace();
  const organizationId = workspace.organizations[0].id;
  const next = updateOrganization(workspace, organizationId, {
    name: 'Hamba Group',
    icon: 'data:image/png;base64,updated',
    description: 'Updated parent organization',
  });

  assert.equal(next.organizations[0].name, 'Hamba Group');
  assert.equal(next.organizations[0].icon, 'data:image/png;base64,updated');
  assert.equal(next.organizations[0].description, 'Updated parent organization');
  assert.equal(getPropertiesForOrganization(next, organizationId).length, 2);
});

test('adding a property links it to the selected organization', () => {
  const workspace = createSeedWorkspace();
  const organization = workspace.organizations[0];
  const next = addProperty(workspace, organization.id, {
    name: 'Cape Town Loft',
    location: 'Cape Town CBD',
    icon: 'ct',
    imageUrl: '',
  });
  const properties = getPropertiesForOrganization(next, organization.id);

  assert.equal(properties[0].name, 'Cape Town Loft');
  assert.equal(properties[0].organizationId, organization.id);
  assert.equal(properties[0].chatbot.model, 'gpt-5.4');
  assert.equal(properties[0].chatbot.retrievalMemoryMode, 'hybrid');
});

test('workspace summary counts each property as a chatbot workspace', () => {
  const workspace = createSeedWorkspace();
  assert.deepEqual(getWorkspaceSummary(workspace), {
    organizationCount: 1,
    propertyCount: 2,
    chatbotCount: 2,
  });
});

test('property chatbot settings can be updated independently', () => {
  const workspace = createSeedWorkspace();
  const target = workspace.properties[0];
  const untouched = workspace.properties[1];
  const next = updatePropertyChatbot(workspace, target.id, {
    model: 'gpt-5.4-mini',
    systemPrompt: 'Custom property instruction',
    knowledgeSources: ['Lease terms and viewing policy'],
  });

  assert.equal(next.properties[0].chatbot.model, 'gpt-5.4-mini');
  assert.equal(next.properties[0].chatbot.systemPrompt, 'Custom property instruction');
  assert.deepEqual(next.properties[0].chatbot.knowledgeSources, ['Lease terms and viewing policy']);
  assert.equal(next.properties[0].chatbot.retrievalTopK, 5);
  assert.equal(next.properties[1].chatbot.model, untouched.chatbot.model);
});

test('property details can be updated independently of chatbot settings', () => {
  const workspace = createSeedWorkspace();
  const target = workspace.properties[0];
  const next = updateProperty(workspace, target.id, {
    name: 'Updated Property',
    location: 'Cape Town',
    icon: 'cp',
    imageUrl: 'https://example.com/property.jpg',
  });
  const updated = next.properties.find((property) => property.id === target.id);

  assert.equal(updated?.name, 'Updated Property');
  assert.equal(updated?.location, 'Cape Town');
  assert.equal(updated?.icon, 'CP');
  assert.equal(updated?.imageUrl, 'https://example.com/property.jpg');
  assert.equal(updated?.chatbot.model, target.chatbot.model);
});

test('maps Supabase rows into organization property workspace state', () => {
  const workspace = mapWorkspaceRows({
    organizations: [
      { id: 'org-1', name: 'Org One', icon: 'O1', description: 'Parent' },
    ],
    properties: [
      {
        id: 'prop-1',
        organization_id: 'org-1',
        name: 'Property One',
        location: 'Johannesburg',
        icon: 'P1',
        image_url: 'https://example.com/image.jpg',
      },
    ],
    chatbotSettings: [
      {
        property_id: 'prop-1',
        provider: 'openai',
        model: 'gpt-5.4-mini',
        temperature: '0.7',
        system_prompt: 'Custom instructions',
        knowledge_sources: ['FAQ'],
        quick_replies: ['Book now'],
        whatsapp_templates: ['Welcome'],
        retrieval_top_k: 7,
        retrieval_similarity_threshold: '0.35',
        retrieval_memory_mode: 'rolling_window',
        retrieval_history_window: 12,
      },
    ],
  });

  assert.equal(workspace.organizations[0].name, 'Org One');
  assert.equal(workspace.properties[0].organizationId, 'org-1');
  assert.equal(workspace.properties[0].chatbot.model, 'gpt-5.4-mini');
  assert.equal(workspace.properties[0].chatbot.temperature, 0.7);
  assert.equal(workspace.properties[0].chatbot.retrievalTopK, 7);
  assert.equal(workspace.properties[0].chatbot.retrievalSimilarityThreshold, 0.35);
  assert.equal(workspace.properties[0].chatbot.retrievalMemoryMode, 'rolling_window');
  assert.equal(workspace.properties[0].chatbot.retrievalHistoryWindow, 12);
});

test('deleting an organization removes its child properties locally', () => {
  const workspace = createSeedWorkspace();
  const organizationId = workspace.organizations[0].id;
  const next = deleteOrganization(workspace, organizationId);

  assert.equal(next.organizations.length, 0);
  assert.equal(next.properties.length, 0);
});

test('deleting a property keeps its parent organization locally', () => {
  const workspace = createSeedWorkspace();
  const propertyId = workspace.properties[0].id;
  const next = deleteProperty(workspace, propertyId);

  assert.equal(next.organizations.length, workspace.organizations.length);
  assert.equal(next.properties.some((property) => property.id === propertyId), false);
});
