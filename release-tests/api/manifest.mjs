// Every deployed API method is explicit. Adding a route without a check fails CI.
// Validation-only cases prove authentication/validation, not mutation persistence.
const read = (route, shape, query = '') => ({ method: 'GET', route, shape, query, status: 200, mode: 'read', budgetMs: 15000 });
const invalid = (method, route, error) => ({ method, route, body: {}, status: 400, error, mode: 'validation', budgetMs: 15000, limitation: 'Valid mutations and persistence are not exercised against tenant records.' });
export const cases = [
  read('/api/admin/bank-accounts', 'accounts:array'),
  read('/api/analytics/overview', 'data:object', '?propertyId=$PROPERTY&window=30d&channel=all'),
  { method: 'POST', route: '/api/chat', status: 200, body: { messages: [{ role: 'user', content: 'Reply with the single word READY.' }], systemPrompt: 'This is a deployment availability test. Reply READY.', retrieval: { memoryMode: 'rolling_window' } }, shape: 'reply:string', mode: 'provider', budgetMs: 60000 },
  read('/api/history', 'threads:array'),
  { method: 'POST', route: '/api/history', body: { dryRun: true, threads: [] }, status: 200, shape: 'dryRun:true', mode: 'dry-run', budgetMs: 15000, limitation: 'Legacy global history storage writes are not exercised.' },
  { method: 'DELETE', route: '/api/history', query: '?dryRun=true', status: 200, shape: 'dryRun:true', mode: 'dry-run', budgetMs: 15000, limitation: 'No history is removed.' },
  invalid('DELETE', '/api/kb/delete', 'KB id or sourceId required'),
  read('/api/kb/list', 'data:array', '?propertyId=$PROPERTY'),
  { method: 'POST', route: '/api/kb/search', body: { query: 'Deployment availability check', propertyId: '$PROPERTY', matchCount: 1 }, status: 200, shape: 'data:array', mode: 'provider', budgetMs: 60000, limitation: 'Text fallback fails the integration check; result contents are never logged.' },
  invalid('PATCH', '/api/kb/update', 'KB ID required'),
  invalid('POST', '/api/kb/upload', 'Missing required fields'),
  read('/api/models', 'models:array', '?provider=openai'),
  { method: 'GET', route: '/api/monthly-payments/import', status: 200, mode: 'job-status', budgetMs: 15000 },
  { method: 'POST', route: '/api/monthly-payments/import', body: { billingPeriod: '$PERIOD', source: 'both', dryRun: true }, status: 202, mode: 'workflow', budgetMs: 15000 },
  read('/api/monthly-payments/import/google-cloud', 'status:object'),
  { method: 'GET', route: '/api/monthly-payments/import/reconcile', query: '?dryRun=true', status: 202, mode: 'workflow', budgetMs: 15000 },
  { method: 'POST', route: '/api/monthly-payments/import/reconcile', body: { dryRun: true }, status: 202, mode: 'workflow', budgetMs: 15000 },
  invalid('POST', '/api/monthly-payments/references', 'Missing action'),
  invalid('POST', '/api/monthly-payments/rooms', 'propertyId is required'),
  read('/api/property-content', 'data:object', '?propertyId=$PROPERTY'),
  invalid('POST', '/api/property-content', 'propertyId is required'),
  read('/api/settings/prompt', 'data:object'),
  { method: 'PUT', route: '/api/settings/prompt', body: { dryRun: true, temperature: 0.4 }, status: 200, shape: 'dryRun:true', mode: 'dry-run', budgetMs: 15000, limitation: 'Shared configuration is validated and read, never overwritten.' },
  { method: 'GET', route: '/api/whatsapp/webhook', mode: 'webhook-challenge', status: 200, budgetMs: 15000 },
  { method: 'POST', route: '/api/whatsapp/webhook', body: { object: 'whatsapp_business_account', entry: [] }, mode: 'signed-webhook', status: 200, budgetMs: 15000, limitation: 'Signature and acknowledgement only; no real inbound event or tenant send.' },
  { method: 'POST', route: '/api/whatsapp/flows/waiting-list', mode: 'encrypted-ping', status: 200, budgetMs: 15000, limitation: 'Encryption and ping only; Google Sheets submission is not written.' },
  { method: 'POST', route: '/api/release-check', body: { probe: 'webhook-post' }, status: 200, shape: 'success:true', mode: 'provider-probe', budgetMs: 30000 },
  read('/api/workspace', 'data:object'),
  { method: 'POST', route: '/api/workspace', body: { action: 'validateOnly', payload: {} }, status: 200, shape: 'data:object', mode: 'dry-run', budgetMs: 15000, limitation: 'Current workspace is read; organizational mutations are not executed.' },
];
export const dependencies = {
  Supabase: ['workspace', 'property content', 'analytics', 'KB', 'import checkpoints', 'matching rules'],
  Google: ['Gmail source listing', 'Drive original download and SHA256 validation', 'sample PDF reparse'],
  Workflow: ['queued job', 'persisted steps', 'terminal result', 'matching dry run'],
  LLM: ['configured chat provider only; unused provider credentials are not verified'],
  Meta: ['signed empty webhook', 'encrypted Flow ping; outbound delivery is deliberately not tested'],
  limits: ['No tenant messages, sign-off, rent/credit changes, shared settings changes, or real ledger insertions.', 'Valid mutation persistence requires isolated test fixtures; validation-only coverage is reported explicitly.'],
};
