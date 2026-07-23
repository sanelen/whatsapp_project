import {
  advanceHambaFlow,
  startHambaFlow,
  type HambaFlowCatalog,
  type HambaFlowResult,
  type HambaFlowState,
  type TenantSupportCategory,
} from '@/lib/channels/hamba-flow';

export type HambaIntent =
  | 'services'
  | 'property_media'
  | 'property_search'
  | 'property_question'
  | 'viewing'
  | 'application'
  | 'documents'
  | 'tenant_support'
  | 'maintenance'
  | 'payment'
  | 'lease'
  | 'access'
  | 'safety'
  | 'human'
  | 'stop'
  | 'menu'
  | 'unclear';

export type HambaIntentInterpretation = {
  intent: HambaIntent;
  label: string;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
};

export type HambaHarnessTurn = HambaFlowResult & {
  interpretation: HambaIntentInterpretation;
  routedSteps: string[];
};

type IntentRule = {
  intent: HambaIntent;
  label: string;
  phrases: string[];
};

const INTENT_RULES: IntentRule[] = [
  { intent: 'safety', label: 'Urgent safety issue', phrases: ['danger', 'fire', 'smoke', 'sparking', 'electric shock', 'break in', 'break-in', 'flooding', 'burst pipe'] },
  { intent: 'human', label: 'Speak to a person', phrases: ['human', 'agent', 'person', 'someone call me', 'staff member'] },
  { intent: 'stop', label: 'Stop optional messages', phrases: ['stop', 'unsubscribe', 'opt out'] },
  { intent: 'services', label: 'Services and capabilities', phrases: ['what services', 'what do you do', 'what do you offer', 'how can you help', 'can you help me', 'services you offer'] },
  { intent: 'property_media', label: 'Property pamphlets and photos', phrases: ['send me pictures', 'share pictures', 'show me pictures', 'send pictures', 'send me photos', 'share photos', 'show me photos', 'property pictures', 'property photos', 'photos and videos', 'pamphlet', 'brochure', 'portfolio'] },
  { intent: 'documents', label: 'Application documents', phrases: ['payslip', 'bank statement', 'identity document', 'id document', 'documents', 'upload'] },
  { intent: 'viewing', label: 'Arrange a viewing', phrases: ['viewing', 'come view', 'see the room', 'see the unit', 'book a visit', 'appointment'] },
  { intent: 'application', label: 'Rental application', phrases: ['apply', 'application', 'qualify', 'requirements to rent'] },
  { intent: 'maintenance', label: 'Maintenance or repairs', phrases: ['maintenance', 'repair', 'broken', 'leak', 'leaking', 'tap', 'toilet', 'no water', 'no electricity'] },
  { intent: 'payment', label: 'Payment or statement help', phrases: ['payment', 'statement', 'paid rent', 'proof of payment', 'balance', 'arrears'] },
  { intent: 'lease', label: 'Lease or notice help', phrases: ['lease', 'notice', 'move out', 'moving out', 'renewal', 'terminate'] },
  { intent: 'access', label: 'Keys, access or security', phrases: ['key', 'keys', 'locked out', 'access', 'gate', 'remote'] },
  { intent: 'tenant_support', label: 'Existing tenant support', phrases: ['i am a tenant', "i'm a tenant", 'my unit', 'my room', 'where i live'] },
  { intent: 'property_search', label: 'Find a rental', phrases: ['looking for a room', 'need a room', 'looking for a rental', 'available room', 'available unit', 'vacancy', 'rent a room'] },
];

const INTENT_LABELS: Record<HambaIntent, string> = {
  services: 'Services and capabilities',
  property_media: 'Property pamphlets and photos',
  property_search: 'Find a rental',
  property_question: 'Property question',
  viewing: 'Arrange a viewing',
  application: 'Rental application',
  documents: 'Application documents',
  tenant_support: 'Existing tenant support',
  maintenance: 'Maintenance or repairs',
  payment: 'Payment or statement help',
  lease: 'Lease or notice help',
  access: 'Keys, access or security',
  safety: 'Urgent safety issue',
  human: 'Speak to a person',
  stop: 'Stop optional messages',
  menu: 'Return to menu',
  unclear: 'Needs clarification',
};

const SERVICES_REPLY = [
  'Hamba Trading can help with:',
  '• finding a rental and checking verified availability',
  '• property details, locations and unit-specific questions',
  '• arranging a preferred viewing time for staff confirmation',
  '• guiding a rental application and checking whether required documents are complete',
  '• existing-tenant maintenance, payment, lease and access support',
  '',
  'Tell me what you need in your own words, or ask for a person at any time.',
].join('\n');

export const PROPERTY_MEDIA_REPLY = [
  'Of course — here are our approved property pamphlets and photo portfolios:',
  '',
  '1. 33 Essex — Bulwer / Berea',
  '📍 33 Essex Road, Bulwer, Berea, Durban, 4083',
  '📄 Pamphlet: https://hambatrading.co.za/marketing/hamba-essex-advert.pdf',
  '📷 Photos and videos: https://photos.app.goo.gl/kMR2VEfBo4EXLZJQA',
  '',
  '2. Westrich — Newlands West',
  '📍 House No. 10, 109585 St, Earlsfield, Newlands West, 4037',
  '📄 Pamphlet: https://hambatrading.co.za/marketing/hamba-westrich-advert.pdf',
  '📷 Photos and videos: https://photos.app.goo.gl/xwUqocDcoAvnMpmW8',
  '',
  '3. Quarry Heights — Newlands East',
  '📍 28 Nkunzana Grove, Newlands East, 4037',
  '📄 Pamphlet: https://hambatrading.co.za/marketing/hamba-quarry-heights-advert.pdf',
  '📷 Photos and videos: https://photos.app.goo.gl/56RH6eEDm8tBMWxo8',
  '',
  'Tell me the property name that interests you and I can help with current availability or a viewing. Photos show property examples; staff confirms the final room and terms.',
].join('\n');

const APPLICATION_PREFIX = [
  'I can guide the application and check whether the required documents are present and readable. A Hamba staff member makes the final housing decision.',
  '',
].join('\n');

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function exactCommand(input: string): HambaIntent | null {
  if (['human', 'agent', 'person'].includes(input)) return 'human';
  if (['stop', 'unsubscribe'].includes(input)) return 'stop';
  if (['menu', 'start'].includes(input)) return 'menu';
  return null;
}

export function interpretHambaMessage(message: string): HambaIntentInterpretation {
  const input = normalized(message);
  const command = exactCommand(input);
  if (command) {
    return { intent: command, label: INTENT_LABELS[command], confidence: 'high', signals: [input] };
  }

  for (const rule of INTENT_RULES) {
    const signals = rule.phrases.filter((phrase) => input.includes(phrase));
    if (signals.length > 0) {
      return {
        intent: rule.intent,
        label: rule.label,
        confidence: signals.length > 1 || input === signals[0] ? 'high' : 'medium',
        signals,
      };
    }
  }

  if (/^(what|when|where|which|who|why|how|can|could|do|does|is|are|tell me|price|cost|rent|deposit)/.test(input) || input.endsWith('?')) {
    return { intent: 'property_question', label: INTENT_LABELS.property_question, confidence: 'medium', signals: ['question form'] };
  }

  return { intent: 'unclear', label: INTENT_LABELS.unclear, confidence: 'low', signals: [] };
}

function mentionedLocation(message: string, catalog: HambaFlowCatalog) {
  const input = normalized(message);
  return catalog.locations.find((location) =>
    [location.id, location.name, location.area].some((candidate) => input.includes(normalized(candidate)))
  );
}

function mentionedUnit(message: string, catalog: HambaFlowCatalog, locationId?: string) {
  const input = normalized(message);
  const location = catalog.locations.find((item) => item.id === locationId);
  return location?.units.find((unit) => [unit.id, unit.label].some((candidate) => input.includes(normalized(candidate))));
}

function withInterpretation(
  result: HambaFlowResult,
  interpretation: HambaIntentInterpretation,
  routedSteps: string[]
): HambaHarnessTurn {
  return { ...result, interpretation, routedSteps };
}

function withEntitySignals(
  interpretation: HambaIntentInterpretation,
  locationName?: string,
  unitLabel?: string
): HambaIntentInterpretation {
  const entitySignals = [locationName, unitLabel].filter((value): value is string => Boolean(value));
  if (entitySignals.length === 0) return interpretation;

  return {
    ...interpretation,
    confidence: 'high',
    signals: [...interpretation.signals, ...entitySignals],
  };
}

function routeProspect(
  state: HambaFlowState,
  message: string,
  catalog: HambaFlowCatalog,
  interpretation: HambaIntentInterpretation
) {
  const routedSteps = ['intent', 'prospect'];
  let result = advanceHambaFlow(state, '1', catalog);
  const location = mentionedLocation(message, catalog);
  if (location && result.state.step === 'prospect.location') {
    result = advanceHambaFlow(result.state, location.name, catalog);
    routedSteps.push('location');
  }
  const unit = mentionedUnit(message, catalog, result.state.locationId);
  if (unit && result.state.step === 'prospect.unit') {
    result = advanceHambaFlow(result.state, unit.label, catalog);
    routedSteps.push('unit');
  }
  if (interpretation.intent === 'viewing' && result.state.step === 'prospect.unit_action') {
    result = advanceHambaFlow(result.state, '1', catalog);
    routedSteps.push('viewing');
  }
  return withInterpretation(
    result,
    withEntitySignals(interpretation, location?.name, unit?.label),
    routedSteps
  );
}

function supportCategory(intent: HambaIntent): TenantSupportCategory | null {
  if (intent === 'maintenance') return 'maintenance';
  if (intent === 'payment') return 'payment';
  if (intent === 'lease') return 'lease';
  if (intent === 'access') return 'access';
  if (intent === 'safety') return 'safety';
  return null;
}

function routeTenantSupport(
  state: HambaFlowState,
  message: string,
  catalog: HambaFlowCatalog,
  interpretation: HambaIntentInterpretation
) {
  const routedSteps = ['intent', 'tenant support'];
  let result = advanceHambaFlow(state, '2', catalog);
  const location = mentionedLocation(message, catalog);
  if (location && result.state.step === 'tenant.location') {
    result = advanceHambaFlow(result.state, location.name, catalog);
    routedSteps.push('location');
  }
  const unit = mentionedUnit(message, catalog, result.state.locationId);
  if (unit && result.state.step === 'tenant.unit') {
    result = advanceHambaFlow(result.state, unit.label, catalog);
    routedSteps.push('unit');
  }
  const category = supportCategory(interpretation.intent);
  if (category && result.state.step === 'tenant.category') {
    result = advanceHambaFlow(result.state, category, catalog);
    routedSteps.push(category);
  }
  return withInterpretation(
    result,
    withEntitySignals(interpretation, location?.name, unit?.label),
    routedSteps
  );
}

export function advanceNaturalHambaFlow(
  state: HambaFlowState,
  message: string,
  catalog: HambaFlowCatalog,
  options?: { greeting?: string }
): HambaHarnessTurn {
  const interpretation = interpretHambaMessage(message);

  if (interpretation.intent === 'menu') {
    return withInterpretation(startHambaFlow(options?.greeting), interpretation, ['global command']);
  }

  if (['human', 'stop'].includes(interpretation.intent)) {
    return withInterpretation(advanceHambaFlow(state, message, catalog), interpretation, ['global command']);
  }

  if (interpretation.intent === 'services') {
    return withInterpretation({ state, reply: SERVICES_REPLY }, interpretation, ['intent', 'capabilities']);
  }

  if (interpretation.intent === 'property_media') {
    return withInterpretation(
      { state: { step: 'menu' }, reply: PROPERTY_MEDIA_REPLY },
      interpretation,
      ['global property media']
    );
  }

  if (state.step !== 'menu') {
    return withInterpretation(advanceHambaFlow(state, message, catalog), interpretation, ['current journey']);
  }

  if (['property_search', 'viewing'].includes(interpretation.intent)) {
    return routeProspect(state, message, catalog, interpretation);
  }

  if (['application', 'documents'].includes(interpretation.intent)) {
    const prospect = routeProspect(state, message, catalog, interpretation);
    return { ...prospect, reply: `${APPLICATION_PREFIX}${prospect.reply}` };
  }

  if (['tenant_support', 'maintenance', 'payment', 'lease', 'access', 'safety'].includes(interpretation.intent)) {
    return routeTenantSupport(state, message, catalog, interpretation);
  }

  if (interpretation.intent === 'unclear' && ['hi', 'hello', 'hey', 'good morning', 'good afternoon'].includes(normalized(message))) {
    return withInterpretation(startHambaFlow(options?.greeting), interpretation, ['greeting fallback']);
  }

  return withInterpretation(advanceHambaFlow(state, message, catalog), interpretation, ['verified question path']);
}
