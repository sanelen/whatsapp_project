import {
  advanceHambaFlow,
  resumeHambaFlowState,
  startHambaFlow,
  type HambaFlowCatalog,
  type HambaFlowResult,
  type HambaFlowState,
} from '@/lib/channels/hamba-flow';
import {
  buildLocationChoiceReply,
  findProspectProperty,
  propertyQuickReplies,
} from '@/lib/channels/hamba-property-marketing';

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
  { intent: 'documents', label: 'Application documents', phrases: ['payslip', 'bank statement', 'identity document', 'id document', 'upload documents', 'send documents'] },
  { intent: 'maintenance', label: 'Maintenance or repairs', phrases: ['maintenance', 'repair', 'broken', 'leak', 'leaking', 'tap', 'toilet', 'no water', 'no electricity'] },
  { intent: 'payment', label: 'Payment or statement help', phrases: ['payment', 'statement', 'paid rent', 'proof of payment', 'arrears'] },
  { intent: 'lease', label: 'Lease or notice help', phrases: ['lease', 'notice', 'move out', 'moving out', 'renewal', 'terminate'] },
  { intent: 'access', label: 'Keys, access or security', phrases: ['key', 'keys', 'locked out', 'access', 'gate remote'] },
  { intent: 'tenant_support', label: 'Existing tenant support', phrases: ['i am a tenant', "i'm a tenant", 'my unit', 'my room', 'where i live'] },
  { intent: 'property_media', label: 'Property pamphlets and photos', phrases: ['send me pictures', 'share pictures', 'show me pictures', 'send pictures', 'send me photos', 'share photos', 'show me photos', 'property pictures', 'property photos', 'photos and videos', 'pamphlet', 'brochure', 'portfolio'] },
  { intent: 'services', label: 'Rental services', phrases: ['what services', 'what do you do', 'what do you offer', 'how can you help', 'can you help me', 'services you offer'] },
  { intent: 'viewing', label: 'Arrange a viewing', phrases: ['viewing', 'come view', 'see the room', 'see the unit', 'book a visit', 'appointment'] },
  { intent: 'application', label: 'Rental application', phrases: ['apply', 'application', 'qualify', 'requirements to rent'] },
  {
    intent: 'property_search',
    label: 'Find a rental',
    phrases: [
      'looking for a room',
      'looking for a unit',
      'looking for one',
      'need a room',
      'need a unit',
      'want a room',
      'want a unit',
      'looking for a rental',
      'available room',
      'available unit',
      'check availability',
      'recheck availability',
      'check again',
      'check one more time',
      'one more please check',
      'not in any unit',
      'not a tenant',
      'what properties',
      'property options',
      'tell me about your properties',
      'where are the units',
      'where are these units',
      'where are your units',
      'where are your properties',
      'what locations',
      'which locations',
      'other location',
      'other locations',
      'another location',
      'other areas',
      'which areas',
      'areas do you cover',
      'anything elsewhere',
      'somewhere else',
      'anything near',
      'vacancy',
      'rent a room',
      'rent a unit',
    ],
  },
];

const INTENT_LABELS: Record<HambaIntent, string> = {
  services: 'Rental services',
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
  menu: 'Start a property enquiry',
  unclear: 'Continue prospect intake',
};

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function exactCommand(input: string): HambaIntent | null {
  if (['human', 'agent', 'person'].includes(input)) return 'human';
  if (['stop', 'unsubscribe'].includes(input)) return 'stop';
  if (['menu', 'start'].includes(input)) return 'menu';
  return null;
}

function containsPhrase(input: string, phrase: string) {
  const escaped = phrase
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  return new RegExp(`(?:^|\\b)${escaped}(?:$|\\b)`, 'i').test(input);
}

export function interpretHambaMessage(message: string): HambaIntentInterpretation {
  const input = normalized(message);
  const command = exactCommand(input);
  if (command) {
    return { intent: command, label: INTENT_LABELS[command], confidence: 'high', signals: [input] };
  }

  for (const rule of INTENT_RULES) {
    const signals = rule.phrases.filter((phrase) => containsPhrase(input, phrase));
    if (signals.length > 0) {
      return {
        intent: rule.intent,
        label: rule.label,
        confidence: signals.length > 1 || input === signals[0] ? 'high' : 'medium',
        signals,
      };
    }
  }

  if (/\b(picture|pictures|photo|photos|pamphlet|brochure)\b/i.test(input)) {
    return {
      intent: 'property_media',
      label: INTENT_LABELS.property_media,
      confidence: 'medium',
      signals: ['media word'],
    };
  }

  if (/^(what|when|where|which|who|why|how|can|could|do|does|is|are|tell me|price|cost|rent|deposit|available|availability|check|recheck)/.test(input) || input.endsWith('?')) {
    return { intent: 'property_question', label: INTENT_LABELS.property_question, confidence: 'medium', signals: ['question form'] };
  }

  return { intent: 'unclear', label: INTENT_LABELS.unclear, confidence: 'low', signals: [] };
}

function withInterpretation(
  result: HambaFlowResult,
  interpretation: HambaIntentInterpretation,
  routedSteps: string[]
): HambaHarnessTurn {
  return { ...result, interpretation, routedSteps };
}

function staffHandoff(
  state: HambaFlowState,
  interpretation: HambaIntentInterpretation,
  reason: string,
  reply: string
) {
  return withInterpretation(
    {
      state: { ...resumeHambaFlowState(state), step: 'handoff' },
      reply,
      action: { type: 'handoff', reason },
    },
    interpretation,
    ['deterministic guardrail', 'human handoff']
  );
}

function routeProspect(
  message: string,
  catalog: HambaFlowCatalog,
  interpretation: HambaIntentInterpretation,
  greeting?: string
) {
  const property = findProspectProperty(message);
  if (!property) {
    const availabilityIntro = /\b(recheck|check again|check availability|availability|vacancy|one more|please check)\b/i.test(message)
      ? 'Absolutely — which property should Hamba staff recheck for you?'
      : greeting || 'Great. Where would you like to stay?';
    return withInterpretation(
      {
        state: { step: 'prospect.location' },
        reply: buildLocationChoiceReply(availabilityIntro),
        quickReplies: propertyQuickReplies(),
      },
      interpretation,
      ['intent', 'prospect', 'location choice']
    );
  }
  const result = advanceHambaFlow({ step: 'prospect.location' }, property.name, catalog);
  return withInterpretation(
    result,
    { ...interpretation, confidence: 'high', signals: [...interpretation.signals, property.name] },
    ['intent', 'prospect', 'property']
  );
}

export function advanceNaturalHambaFlow(
  savedState: HambaFlowState,
  message: string,
  catalog: HambaFlowCatalog,
  options?: { greeting?: string }
): HambaHarnessTurn {
  const interpretation = interpretHambaMessage(message);
  const state = ['handoff', 'stopped'].includes(savedState.step)
    ? savedState
    : resumeHambaFlowState(savedState);

  if (interpretation.intent === 'menu') {
    return withInterpretation(startHambaFlow(options?.greeting), interpretation, ['global command', 'prospect']);
  }

  if (['human', 'stop'].includes(interpretation.intent)) {
    return withInterpretation(advanceHambaFlow(state, message, catalog), interpretation, ['global command']);
  }

  if (interpretation.intent === 'safety') {
    return staffHandoff(
      state,
      interpretation,
      'Urgent safety issue requires human handling',
      'If anyone is in immediate danger, contact the appropriate emergency service first. I’ve marked this for urgent Hamba staff attention.'
    );
  }

  if (interpretation.intent === 'documents') {
    return staffHandoff(
      state,
      interpretation,
      'Document handling is outside the automated prospect flow',
      'A Hamba staff member will guide any application documents. Please do not send an ID, banking password, PIN or one-time password to this automated assistant.'
    );
  }

  if (['tenant_support', 'maintenance', 'payment', 'lease', 'access'].includes(interpretation.intent)) {
    return staffHandoff(
      state,
      interpretation,
      'Existing-tenant servicing is handled by staff',
      'This automated assistant currently handles property enquiries only. I’ve marked your message for Hamba staff to assist with the existing-tenancy matter.'
    );
  }

  if (interpretation.intent === 'property_media') {
    const property = findProspectProperty(message);
    if (property) {
      const result = advanceHambaFlow({ step: 'prospect.location' }, property.name, catalog);
      return withInterpretation(
        result,
        interpretation,
        ['intent', 'prospect', 'selected property media']
      );
    }
    return withInterpretation(
      {
        state: { step: 'prospect.location' },
        reply: buildLocationChoiceReply('Of course — which property would you like photos and a pamphlet for?'),
        quickReplies: propertyQuickReplies(),
      },
      interpretation,
      ['intent', 'prospect', 'location choice']
    );
  }

  if (['services', 'property_search', 'viewing', 'application'].includes(interpretation.intent)) {
    if (
      state.propertyInterest
      && ['viewing', 'application'].includes(interpretation.intent)
    ) {
      return withInterpretation(
        advanceHambaFlow(
          state,
          interpretation.intent === 'viewing' ? 'arrange a viewing' : 'I want to apply',
          catalog
        ),
        interpretation,
        ['intent', 'prospect', 'application interest']
      );
    }
    return routeProspect(message, catalog, interpretation, options?.greeting);
  }

  if (interpretation.intent === 'unclear' && ['hi', 'hello', 'hey', 'good morning', 'good afternoon'].includes(normalized(message))) {
    return withInterpretation(startHambaFlow(options?.greeting), interpretation, ['greeting', 'prospect', 'entry question']);
  }

  return withInterpretation(
    advanceHambaFlow(state, message, catalog),
    interpretation,
    interpretation.intent === 'property_question'
      ? ['prospect', 'guardrailed property question']
      : ['prospect', 'deterministic intake']
  );
}
