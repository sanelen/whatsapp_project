export type HambaFlowStep =
  | 'menu'
  | 'prospect.location'
  | 'prospect.unit'
  | 'prospect.unit_action'
  | 'prospect.viewing_time'
  | 'prospect.confirm'
  | 'tenant.location'
  | 'tenant.unit'
  | 'tenant.category'
  | 'tenant.details'
  | 'faq.topic'
  | 'handoff'
  | 'stopped';

export type HambaFlowState = {
  step: HambaFlowStep;
  locationId?: string;
  unitId?: string;
  viewingPreference?: string;
  tenantCategory?: TenantSupportCategory;
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

export type TenantSupportCategory = 'maintenance' | 'payment' | 'lease' | 'access' | 'safety' | 'other';

export type HambaFlowAction =
  | {
      type: 'answer_property_question';
      query: string;
      locationId?: string;
      unitId?: string;
    }
  | {
      type: 'create_viewing_request';
      locationId: string;
      unitId: string;
      viewingPreference: string;
    }
  | {
      type: 'create_tenant_support_request';
      locationId: string;
      unitId: string;
      category: TenantSupportCategory;
      details: string;
    }
  | { type: 'handoff'; reason: string }
  | { type: 'opt_out' };

export type HambaFlowResult = {
  state: HambaFlowState;
  reply: string;
  action?: HambaFlowAction;
};

const MAIN_MENU = DEFAULT_ASSISTANT_GREETING;

const TENANT_CATEGORIES: Array<{ value: TenantSupportCategory; label: string }> = [
  { value: 'maintenance', label: 'Maintenance or repairs' },
  { value: 'payment', label: 'Payment or statement question' },
  { value: 'lease', label: 'Lease or notice question' },
  { value: 'access', label: 'Keys, access or security' },
  { value: 'safety', label: 'Urgent safety issue' },
  { value: 'other', label: 'Something else' },
];

function normalized(value: string) {
  return value.trim().toLowerCase();
}

function looksLikeQuestion(value: string) {
  const input = normalized(value);
  return value.trim().endsWith('?') || /^(ask\s+|what|when|where|which|who|why|how|can|could|do|does|is|are|tell me|price|cost|rent|deposit|available)/.test(input);
}

function propertyQuestion(state: HambaFlowState, query: string): HambaFlowResult {
  return {
    state,
    reply: 'I’ll answer from Hamba’s verified property information. If the information is missing or uncertain, I’ll ask a staff member instead of guessing.',
    action: {
      type: 'answer_property_question',
      query: query.replace(/^ask\s+/i, '').trim(),
      locationId: state.locationId,
      unitId: state.unitId,
    },
  };
}

function numbered<T>(items: T[], label: (item: T) => string) {
  return items.map((item, index) => `${index + 1}. ${label(item)}`).join('\n');
}

function choose<T>(message: string, items: T[], searchable: (item: T) => string[]) {
  const input = normalized(message);
  const numeric = Number(input);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= items.length) return items[numeric - 1];
  return items.find((item) => searchable(item).some((value) => normalized(value) === input));
}

function locationById(catalog: HambaFlowCatalog, id?: string) {
  return catalog.locations.find((location) => location.id === id);
}

function unitById(location: HambaFlowLocation | undefined, id?: string) {
  return location?.units.find((unit) => unit.id === id);
}

function availableLocations(catalog: HambaFlowCatalog) {
  return catalog.locations.filter((location) => location.units.some((unit) => unit.isAvailable));
}

function tenantCategoryMenu() {
  return `What do you need help with?\n${numbered(TENANT_CATEGORIES, (item) => item.label)}`;
}

export function startHambaFlow(greeting = MAIN_MENU): HambaFlowResult {
  return { state: { step: 'menu' }, reply: greeting };
}

export function resumeHambaFlowState(state: HambaFlowState | null | undefined): HambaFlowState {
  if (!state || state.step === 'handoff' || state.step === 'stopped') return { step: 'menu' };
  return state;
}

export function advanceHambaFlow(
  state: HambaFlowState,
  message: string,
  catalog: HambaFlowCatalog
): HambaFlowResult {
  const input = normalized(message);

  if (input === 'menu' || input === 'start' || input === 'hi' || input === 'hello') return startHambaFlow();
  if (input === 'human' || input === 'agent' || input === 'person') {
    return {
      state: { ...state, step: 'handoff' },
      reply: 'Thanks — I’ve marked this conversation for a Hamba team member. Please add any useful details while you wait.',
      action: { type: 'handoff', reason: 'Customer requested a person' },
    };
  }
  if (input === 'stop') {
    return {
      state: { step: 'stopped' },
      reply: 'You will not receive optional follow-up messages from this assistant. Essential replies about an active request or tenancy may still be sent. Type MENU if you want help again.',
      action: { type: 'opt_out' },
    };
  }

  if (state.step === 'stopped') {
    return { state, reply: 'This assistant is paused. Type MENU to start again.' };
  }

  if (state.step === 'handoff') {
    return {
      state,
      reply: 'Your message has been added to the handoff. A Hamba team member can continue from here.',
    };
  }

  if (state.step === 'menu') {
    if (input === '1') {
      const locations = availableLocations(catalog);
      if (locations.length === 0) {
        return {
          state: { step: 'menu' },
          reply: 'I do not have a verified available unit to show right now. The Hamba team needs to confirm current availability. You can still ask me about our properties, locations, application process or tenant support.',
          action: { type: 'handoff', reason: 'No verified available unit in catalogue' },
        };
      }
      return {
        state: { step: 'prospect.location' },
        reply: `Which location interests you?\n${numbered(locations, (location) => `${location.name} — ${location.area}`)}`,
      };
    }
    if (input === '2') {
      return {
        state: { step: 'tenant.location' },
        reply: `Which property do you live at?\n${numbered(catalog.locations, (location) => `${location.name} — ${location.area}`)}`,
      };
    }
    if (input === '3') {
      return {
        state: { step: 'faq.topic' },
        reply: [
          'Choose a topic:',
          '1. Rental applications and viewings',
          '2. Deposits and rent payments',
          '3. Maintenance and repairs',
          '4. Lease, notice and moving out',
          '5. Speak to a person',
        ].join('\n'),
      };
    }
    if (input === '4') {
      return {
        state: { step: 'handoff' },
        reply: 'I’ve marked this conversation for a Hamba team member. Please tell us briefly what you need.',
        action: { type: 'handoff', reason: 'Main menu handoff' },
      };
    }
    if (message.trim().length >= 4) return propertyQuestion(state, message);
    return { state, reply: `Please reply 1, 2, 3 or 4, or type your property question.\n\n${MAIN_MENU}` };
  }

  if (state.step === 'prospect.location') {
    const locations = availableLocations(catalog);
    const location = choose(message, locations, (item) => [item.id, item.name, item.area]);
    if (!location) {
      if (looksLikeQuestion(message)) return propertyQuestion(state, message);
      return { state, reply: `Please choose one of these locations:\n${numbered(locations, (item) => `${item.name} — ${item.area}`)}` };
    }
    const units = location.units.filter((unit) => unit.isAvailable);
    return {
      state: { step: 'prospect.unit', locationId: location.id },
      reply: `These are the currently verified options at ${location.name}:\n${numbered(units, (unit) => `${unit.label} — ${unit.summary}`)}`,
    };
  }

  if (state.step === 'prospect.unit') {
    const location = locationById(catalog, state.locationId);
    const units = location?.units.filter((unit) => unit.isAvailable) ?? [];
    const unit = choose(message, units, (item) => [item.id, item.label]);
    if (!location || !unit) {
      if (looksLikeQuestion(message)) return propertyQuestion(state, message);
      return { state, reply: `Please choose an available unit:\n${numbered(units, (item) => `${item.label} — ${item.summary}`)}` };
    }
    return {
      state: { step: 'prospect.unit_action', locationId: location.id, unitId: unit.id },
      reply: `${unit.label} at ${location.name}: ${unit.summary}\n\n1. Arrange a viewing\n2. Choose another unit\n3. Return to the main menu`,
    };
  }

  if (state.step === 'prospect.unit_action') {
    if (input === '1') {
      return {
        state: { ...state, step: 'prospect.viewing_time' },
        reply: 'What day and approximate time would suit you for a viewing? For example: “Saturday after 10:00”. A staff member will confirm the final slot.',
      };
    }
    if (input === '2') {
      const location = locationById(catalog, state.locationId);
      const units = location?.units.filter((unit) => unit.isAvailable) ?? [];
      return {
        state: { step: 'prospect.unit', locationId: state.locationId },
        reply: `Choose another unit:\n${numbered(units, (unit) => `${unit.label} — ${unit.summary}`)}`,
      };
    }
    if (input === '3') return startHambaFlow();
    if (looksLikeQuestion(message)) return propertyQuestion(state, message);
    return { state, reply: 'Reply 1 to arrange a viewing, 2 to choose another unit, or 3 for the main menu.' };
  }

  if (state.step === 'prospect.viewing_time') {
    if (message.trim().length < 4) {
      return { state, reply: 'Please give a day and approximate time, for example: “Saturday after 10:00”.' };
    }
    const location = locationById(catalog, state.locationId);
    const unit = unitById(location, state.unitId);
    if (!location || !unit) return startHambaFlow();
    return {
      state: { ...state, step: 'prospect.confirm', viewingPreference: message.trim() },
      reply: `Please confirm this viewing request:\n${location.name} — ${unit.label}\nPreferred time: ${message.trim()}\nContact: this WhatsApp number\n\nReply CONFIRM to send the request, or MENU to cancel. A staff member must confirm the final appointment.`,
    };
  }

  if (state.step === 'prospect.confirm') {
    if (input !== 'confirm') return { state, reply: 'Reply CONFIRM to send this request, or MENU to cancel.' };
    if (!state.locationId || !state.unitId || !state.viewingPreference) return startHambaFlow();
    return {
      state: { step: 'menu' },
      reply: 'Your viewing request has been recorded. A Hamba team member will confirm availability and the final appointment time. Type MENU if you need anything else.',
      action: {
        type: 'create_viewing_request',
        locationId: state.locationId,
        unitId: state.unitId,
        viewingPreference: state.viewingPreference,
      },
    };
  }

  if (state.step === 'tenant.location') {
    const location = choose(message, catalog.locations, (item) => [item.id, item.name, item.area]);
    if (!location) {
      return { state, reply: `Please choose your property:\n${numbered(catalog.locations, (item) => `${item.name} — ${item.area}`)}` };
    }
    return {
      state: { step: 'tenant.unit', locationId: location.id },
      reply: `Which unit or room are you in at ${location.name}?\n${numbered(location.units, (unit) => unit.label)}`,
    };
  }

  if (state.step === 'tenant.unit') {
    const location = locationById(catalog, state.locationId);
    const unit = choose(message, location?.units ?? [], (item) => [item.id, item.label]);
    if (!location || !unit) {
      return { state, reply: `Please choose your unit or room:\n${numbered(location?.units ?? [], (item) => item.label)}` };
    }
    return {
      state: { step: 'tenant.category', locationId: location.id, unitId: unit.id },
      reply: tenantCategoryMenu(),
    };
  }

  if (state.step === 'tenant.category') {
    const category = choose(message, TENANT_CATEGORIES, (item) => [item.value, item.label]);
    if (!category) return { state, reply: tenantCategoryMenu() };
    if (category.value === 'safety') {
      return {
        state: { ...state, step: 'handoff', tenantCategory: category.value },
        reply: 'If anyone is in immediate danger, contact the appropriate emergency service first. I have marked this for urgent staff attention. Send a short description and your safest callback method.',
        action: { type: 'handoff', reason: 'Tenant selected urgent safety issue' },
      };
    }
    return {
      state: { ...state, step: 'tenant.details', tenantCategory: category.value },
      reply: 'Please describe what happened, when it started, and anything the team should know. You can send relevant photos after the description. Never send a banking password, PIN or one-time password.',
    };
  }

  if (state.step === 'tenant.details') {
    if (message.trim().length < 8) {
      return { state, reply: 'Please add a little more detail so the team can act on the request.' };
    }
    if (!state.locationId || !state.unitId || !state.tenantCategory) return startHambaFlow();
    return {
      state: { step: 'menu' },
      reply: 'Your support request has been organised for the Hamba team. You can now send relevant photos or documents in this chat. Type HUMAN for a person or MENU for something else.',
      action: {
        type: 'create_tenant_support_request',
        locationId: state.locationId,
        unitId: state.unitId,
        category: state.tenantCategory,
        details: message.trim(),
      },
    };
  }

  if (state.step === 'faq.topic') {
    const faqReplies: Record<string, string> = {
      '1': 'You can browse verified available units here and request a preferred viewing time. A staff member confirms the final appointment and explains the application documents; the assistant does not approve applications.',
      '2': 'Rent, deposit and payment details depend on the selected unit and signed lease. Never send a banking password, PIN or one-time password. Type HUMAN for an account-specific answer.',
      '3': 'For a repair, choose Existing tenant support from MENU, identify your property and unit, and describe when the problem started. Send relevant photos after the description.',
      '4': 'Lease, notice and moving-out questions are handled against your signed lease and require staff confirmation. Choose Existing tenant support from MENU or type HUMAN.',
    };
    if (input === '5') {
      return {
        state: { step: 'handoff' },
        reply: 'I’ve marked this conversation for a Hamba team member. Please tell us what you need.',
        action: { type: 'handoff', reason: 'FAQ handoff' },
      };
    }
    if (!faqReplies[input]) return { state, reply: 'Reply 1, 2, 3, 4 or 5.' };
    return { state: { step: 'menu' }, reply: `${faqReplies[input]}\n\nType MENU to continue.` };
  }

  return startHambaFlow();
}
import { DEFAULT_ASSISTANT_GREETING } from '@/lib/assistant/defaults';
