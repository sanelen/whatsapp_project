import { DEFAULT_ASSISTANT_GREETING } from '@/lib/assistant/defaults';
import {
  buildLocationChoiceReply,
  buildProspectEntryReply,
  buildSelectedPropertyReply,
  findProspectProperty,
  propertyActionQuickReplies,
  propertyQuickReplies,
  prospectEntryQuickReplies,
  type PropertyQuickReply,
} from '@/lib/channels/hamba-property-marketing';

export type HambaFlowStep =
  | 'prospect.entry'
  | 'prospect.location'
  | 'prospect.property_action'
  | 'prospect.question'
  | 'prospect.budget'
  | 'prospect.move_in'
  | 'prospect.complete'
  | 'handoff'
  | 'stopped'
  // Legacy persisted steps are accepted only so they can be safely normalized.
  | 'menu'
  | 'prospect.unit'
  | 'prospect.unit_action'
  | 'prospect.viewing_time'
  | 'prospect.confirm'
  | 'tenant.location'
  | 'tenant.unit'
  | 'tenant.category'
  | 'tenant.details'
  | 'faq.topic';

export type HambaFlowState = {
  step: HambaFlowStep;
  locationId?: string;
  propertyInterest?: string;
  budget?: string;
  moveInDate?: string;
};

export type HambaFlowUnit = {
  id: string;
  label: string;
  summary: string;
  isAvailable: boolean;
};

export type HambaFlowLocation = {
  id: string;
  name: string;
  area: string;
  units: HambaFlowUnit[];
};

export type HambaFlowCatalog = {
  locations: HambaFlowLocation[];
};

export type HambaFlowAction =
  | {
      type: 'answer_property_question';
      query: string;
      locationId?: string;
      propertyInterest?: string;
    }
  | {
      type: 'create_prospect_lead';
      locationId?: string;
      propertyInterest: string;
      budget: string;
      moveInDate: string;
    }
  | { type: 'handoff'; reason: string }
  | { type: 'opt_out' };

export type HambaFlowResult = {
  state: HambaFlowState;
  reply: string;
  quickReplies?: PropertyQuickReply[];
  action?: HambaFlowAction;
};

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function looksLikeQuestion(value: string) {
  const input = normalized(value);
  return value.trim().endsWith('?')
    || /^(ask\s+|what|when|where|which|who|why|how|can|could|do|does|is|are|tell me|price|cost|rent|deposit|available|availability|check|recheck)/.test(input);
}

function prospectQuestion(state: HambaFlowState, query: string): HambaFlowResult {
  return {
    state,
    reply: 'I can help with that from Hamba’s verified property information.',
    quickReplies: state.propertyInterest ? propertyActionQuickReplies() : propertyQuickReplies(),
    action: {
      type: 'answer_property_question',
      query: query.replace(/^ask\s+/i, '').trim(),
      locationId: state.locationId,
      propertyInterest: state.propertyInterest,
    },
  };
}

function matchCatalogLocation(catalog: HambaFlowCatalog, propertyName: string, aliases: string[]) {
  const candidates = [propertyName, ...aliases].map(normalized);
  return catalog.locations.find((location) => {
    const searchable = normalized(`${location.name} ${location.area}`);
    return candidates.some((candidate) => searchable.includes(candidate) || candidate.includes(normalized(location.name)));
  });
}

function resolvePropertyChoice(message: string, catalog: HambaFlowCatalog) {
  const property = findProspectProperty(message);
  if (property) {
    const location = matchCatalogLocation(catalog, property.name, property.aliases);
    return { propertyInterest: property.name, locationId: location?.id };
  }

  const input = normalized(message);
  const location = catalog.locations.find((item) =>
    [item.id, item.name, item.area].some((candidate) => normalized(candidate) === input)
  );
  return location ? { propertyInterest: location.name, locationId: location.id } : null;
}

function locationPrompt(intro?: string) {
  return buildLocationChoiceReply(intro);
}

function budgetPrompt(propertyInterest: string) {
  return `Great. What monthly rental budget are you working with for ${propertyInterest}? For example: “around R2,500 per month”.`;
}

function moveInPrompt() {
  return 'When would you ideally like to move in? A date or a phrase such as “1 August” or “as soon as possible” is fine.';
}

export function prospectNextPrompt(state: HambaFlowState) {
  const current = resumeHambaFlowState(state);
  if (current.step === 'prospect.entry') return 'Are you looking for a unit to rent?';
  if (current.step === 'prospect.location') return locationPrompt();
  if (current.step === 'prospect.property_action' || current.step === 'prospect.question') {
    return 'Would you like to apply/check availability, ask another question, or choose another location?';
  }
  if (current.step === 'prospect.budget') {
    return `What monthly rental budget are you working with${current.propertyInterest ? ` for ${current.propertyInterest}` : ''}?`;
  }
  if (current.step === 'prospect.move_in') return moveInPrompt();
  return '';
}

function validBudget(message: string) {
  const input = normalized(message);
  return /\d{3,}/.test(input) || ['flexible', 'not sure', 'unsure', 'any budget'].some((value) => input.includes(value));
}

function validMoveInDate(message: string) {
  const input = normalized(message);
  return input.length >= 3 && !looksLikeQuestion(message);
}

export function startHambaFlow(greeting = DEFAULT_ASSISTANT_GREETING): HambaFlowResult {
  return {
    state: { step: 'prospect.entry' },
    reply: buildProspectEntryReply(greeting),
    quickReplies: prospectEntryQuickReplies(),
  };
}

export function resumeHambaFlowState(state: HambaFlowState | null | undefined): HambaFlowState {
  if (!state || !state.step) return { step: 'prospect.entry' };
  if (
    [
      'prospect.entry',
      'prospect.location',
      'prospect.property_action',
      'prospect.question',
      'prospect.budget',
      'prospect.move_in',
      'prospect.complete',
    ].includes(state.step)
  ) {
    return state;
  }
  if (state.step === 'handoff' || state.step === 'stopped') return { step: 'prospect.entry' };
  return { step: 'prospect.location' };
}

function propertySelectionResult(
  choice: { propertyInterest: string; locationId?: string }
): HambaFlowResult {
  const property = findProspectProperty(choice.propertyInterest);
  if (!property) {
    return {
      state: { step: 'prospect.location' },
      reply: locationPrompt(),
      quickReplies: propertyQuickReplies(),
    };
  }
  return {
    state: { step: 'prospect.property_action', ...choice },
    reply: buildSelectedPropertyReply(property),
    quickReplies: propertyActionQuickReplies(),
  };
}

function wantsLocationChoice(input: string) {
  return ['prospect:locations', 'other location', 'another location', 'show me another location'].includes(input);
}

function wantsQuestion(input: string) {
  return ['prospect:question', 'ask a question', 'i want to ask questions', 'question'].includes(input);
}

function wantsApplication(input: string) {
  return [
    'prospect:apply',
    'apply / availability',
    'yes',
    'yes, i want to apply',
    'i want to apply',
    'apply',
    'check availability',
    'arrange a viewing',
    'book a viewing',
  ].includes(input);
}

export function advanceHambaFlow(
  savedState: HambaFlowState,
  message: string,
  catalog: HambaFlowCatalog
): HambaFlowResult {
  const input = normalized(message);

  if (['menu', 'start', 'hi', 'hello', 'hey'].includes(input)) return startHambaFlow();
  if (['human', 'agent', 'person'].includes(input)) {
    return {
      state: { ...resumeHambaFlowState(savedState), step: 'handoff' },
      reply: 'Thanks — I’ve marked this conversation for a Hamba staff member. Please add any useful details while you wait.',
      action: { type: 'handoff', reason: 'Customer requested a person' },
    };
  }
  if (['stop', 'unsubscribe', 'opt out'].includes(input)) {
    return {
      state: { step: 'stopped' },
      reply: 'Optional assistant messages are paused. Type MENU if you want property help again.',
      action: { type: 'opt_out' },
    };
  }

  if (savedState.step === 'stopped') {
    return { state: savedState, reply: 'This assistant is paused. Type MENU to start again.' };
  }
  if (savedState.step === 'handoff') {
    return {
      state: savedState,
      reply: 'Your message has been added for Hamba staff follow-up.',
    };
  }

  const state = resumeHambaFlowState(savedState);

  if (state.step === 'prospect.entry') {
    const choice = resolvePropertyChoice(message, catalog);
    if (choice) return propertySelectionResult(choice);
    if (
      ['prospect:start', 'yes, find me a unit', 'yes', 'yes please'].includes(input)
      || /\b(looking for|need|want)\b.{0,30}\b(unit|room|rental|place)\b/i.test(input)
    ) {
      return {
        state: { step: 'prospect.location' },
        reply: locationPrompt(),
        quickReplies: propertyQuickReplies(),
      };
    }
    return {
      state,
      reply: buildProspectEntryReply(),
      quickReplies: prospectEntryQuickReplies(),
    };
  }

  if (state.step === 'prospect.location') {
    const choice = resolvePropertyChoice(message, catalog);
    if (choice) return propertySelectionResult(choice);
    if (looksLikeQuestion(message)) {
      return {
        state,
        reply: locationPrompt('Which location is your question about?'),
        quickReplies: propertyQuickReplies(),
      };
    }
    return { state, reply: locationPrompt(), quickReplies: propertyQuickReplies() };
  }

  if (state.step === 'prospect.property_action') {
    if (wantsLocationChoice(input)) {
      return {
        state: { step: 'prospect.location' },
        reply: locationPrompt(),
        quickReplies: propertyQuickReplies(),
      };
    }
    if (wantsQuestion(input)) {
      return {
        state: { ...state, step: 'prospect.question' },
        reply: `Sure — what would you like to know about ${state.propertyInterest || 'this property'}? You can ask about rent, deposit, location, parking, occupants, internet or availability.`,
      };
    }
    if (looksLikeQuestion(message)) return prospectQuestion(state, message);
    if (wantsApplication(input) || /\b(apply|application|viewing)\b/i.test(input)) {
      return {
        state: { ...state, step: 'prospect.budget' },
        reply: budgetPrompt(state.propertyInterest || 'this property'),
      };
    }
    const choice = resolvePropertyChoice(message, catalog);
    if (choice) return propertySelectionResult(choice);
    return {
      state,
      reply: 'Choose an option below, or type your question in your own words.',
      quickReplies: propertyActionQuickReplies(),
    };
  }

  if (state.step === 'prospect.question') {
    if (wantsLocationChoice(input)) {
      return {
        state: { step: 'prospect.location' },
        reply: locationPrompt(),
        quickReplies: propertyQuickReplies(),
      };
    }
    if (wantsApplication(input) || /\b(apply|application|viewing)\b/i.test(input)) {
      return {
        state: { ...state, step: 'prospect.budget' },
        reply: budgetPrompt(state.propertyInterest || 'this property'),
      };
    }
    return prospectQuestion(state, message);
  }

  if (state.step === 'prospect.budget') {
    if (wantsLocationChoice(input)) {
      return {
        state: { step: 'prospect.location' },
        reply: locationPrompt(),
        quickReplies: propertyQuickReplies(),
      };
    }
    if (looksLikeQuestion(message)) return prospectQuestion(state, message);
    if (!validBudget(message)) {
      return { state, reply: 'Please share your approximate monthly rental budget, for example “R2,500”, or say “not sure”.' };
    }
    return {
      state: { ...state, step: 'prospect.move_in', budget: message.trim() },
      reply: moveInPrompt(),
    };
  }

  if (state.step === 'prospect.move_in') {
    if (looksLikeQuestion(message)) return prospectQuestion(state, message);
    if (!validMoveInDate(message)) {
      return { state, reply: moveInPrompt() };
    }
    const propertyInterest = state.propertyInterest || 'a Hamba property';
    const budget = state.budget || 'not specified';
    const moveInDate = message.trim();
    return {
      state: { ...state, step: 'prospect.complete', moveInDate },
      reply: [
        'Thank you — I’ve captured your rental enquiry:',
        `• Property / area: ${propertyInterest}`,
        `• Monthly budget: ${budget}`,
        `• Preferred move-in: ${moveInDate}`,
        '',
        'Hamba staff will check current availability and follow up on this WhatsApp number. Nothing is reserved or confirmed until a staff member confirms it.',
      ].join('\n'),
      action: {
        type: 'create_prospect_lead',
        locationId: state.locationId,
        propertyInterest,
        budget,
        moveInDate,
      },
    };
  }

  if (looksLikeQuestion(message)) return prospectQuestion(state, message);
  return {
    state,
    reply: 'Your enquiry is with Hamba staff for an availability check and follow-up. Ask another property question, type MENU to start a new enquiry, or HUMAN for a person.',
  };
}
