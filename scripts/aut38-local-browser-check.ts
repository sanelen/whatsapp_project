import { createServer, type IncomingMessage } from 'node:http';
import {
  generatePropertyAssistantReply,
  type AssistantMessage,
} from '../src/lib/assistant/property-assistant';
import { advanceNaturalHambaFlow } from '../src/lib/channels/hamba-harness';
import { buildVerifiedPropertyQuestionReply } from '../src/lib/channels/hamba-property-marketing';
import {
  prospectNextPrompt,
  startHambaFlow,
  type HambaFlowCatalog,
} from '../src/lib/channels/hamba-flow';
import { getSupabaseAdmin } from '../src/lib/supabase';

const catalog: HambaFlowCatalog = {
  locations: [
    { id: 'essex', name: '33 Essex', area: 'Berea', units: [] },
    { id: 'westridge', name: 'Westrich', area: 'Newlands West', units: [] },
    { id: 'quarry', name: 'Quarry Heights', area: 'Newlands East', units: [] },
  ],
};

const greeting = advanceNaturalHambaFlow(startHambaFlow().state, 'hello', catalog);
const location = advanceNaturalHambaFlow(greeting.state, 'Yes, find me a unit', catalog);
const property = advanceNaturalHambaFlow(location.state, 'Quarry Heights', catalog);
const questionInvite = advanceNaturalHambaFlow(property.state, 'Ask a question', catalog);
const question = advanceNaturalHambaFlow(questionInvite.state, 'Does it have parking?', catalog);
const application = advanceNaturalHambaFlow(property.state, 'Apply / availability', catalog);
const budget = advanceNaturalHambaFlow(application.state, 'R2,500', catalog);
const completion = advanceNaturalHambaFlow(budget.state, '1 August', catalog);
const availability = advanceNaturalHambaFlow(
  { step: 'tenant.category', locationId: 'quarry' },
  'Can you recheck availability?',
  catalog
);

const scenarios = {
  greeting: {
    title: 'Unknown contact greeting',
    customer: 'Hello',
    turn: greeting,
  },
  location: {
    title: 'Location choice',
    customer: 'Yes, find me a unit',
    turn: location,
  },
  property: {
    title: 'Selected property',
    customer: 'Quarry Heights',
    turn: property,
  },
  questionInvite: {
    title: 'Free-text question invitation',
    customer: 'Ask a question',
    turn: questionInvite,
  },
  question: {
    title: 'LLM question routing',
    customer: 'Does it have parking?',
    turn: question,
  },
  application: {
    title: 'Application interest',
    customer: 'Apply / availability',
    turn: application,
  },
  completion: {
    title: 'Staff follow-up capture',
    customer: 'R2,500 → 1 August',
    turn: completion,
  },
  availability: {
    title: 'Availability recheck from stale tenant state',
    customer: 'Can you recheck availability?',
    turn: availability,
  },
};

const payload = JSON.stringify(scenarios).replace(/</g, '\\u003c');
const initialStatePayload = JSON.stringify(startHambaFlow().state).replace(/</g, '\\u003c');

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AUT-38 local prospect-flow check</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; background: #eef6ff; color: #10213b; }
      main { width: min(880px, calc(100% - 32px)); margin: 32px auto; }
      h1 { margin-bottom: 6px; font-size: 24px; }
      h2 { margin: 28px 0 8px; font-size: 18px; }
      .note { margin: 0 0 20px; color: #4d6078; }
      nav { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
      button { border: 1px solid #9ebee0; border-radius: 999px; background: white; color: #174d82; padding: 10px 14px; font-weight: 700; cursor: pointer; }
      button[aria-pressed="true"] { background: #174d82; color: white; }
      .phone { border: 1px solid #bad0e5; border-radius: 24px; background: #f6fbff; box-shadow: 0 16px 40px rgba(24, 66, 108, .14); padding: 22px; }
      .messages { display: grid; gap: 10px; min-height: 92px; max-height: 420px; overflow: auto; padding: 2px; }
      .meta { color: #60758d; font-size: 13px; margin-bottom: 16px; }
      .bubble { max-width: 76%; white-space: pre-wrap; border-radius: 16px; padding: 14px 16px; line-height: 1.45; }
      .customer { margin-left: auto; background: #dcf8c6; }
      .assistant { margin: 10px 0 0; background: white; border: 1px solid #d6e3ef; }
      .quick { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
      .quick span, .quick button { border: 1px solid #69a4d8; border-radius: 999px; background: #f8fcff; color: #1262a2; padding: 8px 12px; font-weight: 700; }
      form { display: flex; gap: 10px; margin-top: 16px; }
      form input { min-width: 0; flex: 1; border: 1px solid #9ebee0; border-radius: 999px; padding: 12px 16px; font: inherit; }
      form button { border-radius: 999px; background: #174d82; color: white; }
      .session-actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 14px; }
      .session-actions button { padding: 7px 11px; font-size: 12px; }
      .empty { color: #60758d; }
      dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 12px; margin: 18px 0 0; font-size: 13px; }
      dt { font-weight: 800; }
      dd { margin: 0; }
    </style>
  </head>
  <body>
    <main>
      <h1>AUT-38 local prospect-flow check</h1>
      <p class="note">Read-only fixture using the same deterministic WhatsApp journey code.</p>

      <h2>Interactive free-text session</h2>
      <p class="note">Type naturally or use a suggested reply. Conversation state is kept between messages. Property questions use the centrally configured assistant when credentials are available.</p>
      <section class="phone" aria-label="Interactive WhatsApp session">
        <div class="messages" id="interactive-messages" aria-live="polite">
          <div class="empty">Try “Hi”, “I need a room in Newlands”, or “Show me Quarry Heights”.</div>
        </div>
        <div class="quick" id="interactive-quick" aria-label="Suggested WhatsApp replies"></div>
        <form id="interactive-form">
          <input id="interactive-input" type="text" maxlength="1000" autocomplete="off" placeholder="Type a WhatsApp message…" aria-label="WhatsApp message" />
          <button type="submit">Send</button>
        </form>
        <div class="session-actions">
          <span class="meta" id="interactive-status">State: new conversation</span>
          <button type="button" id="interactive-reset">Reset session</button>
        </div>
      </section>

      <h2>Recorded safety scenarios</h2>
      <nav aria-label="Recorded scenarios"></nav>
      <section class="phone" aria-live="polite" aria-label="Recorded WhatsApp scenario">
        <div class="meta" id="recorded-meta"></div>
        <div class="bubble customer" id="recorded-customer"></div>
        <div class="bubble assistant" id="recorded-assistant"></div>
        <div class="quick" id="recorded-quick" aria-label="WhatsApp quick replies"></div>
        <dl>
          <dt>State</dt><dd data-field="state"></dd>
          <dt>Intent</dt><dd data-field="intent"></dd>
          <dt>Route</dt><dd data-field="route"></dd>
        </dl>
      </section>
    </main>
    <script>
      const scenarios = ${payload};
      const initialState = ${initialStatePayload};
      const nav = document.querySelector('nav');
      const interactiveMessages = document.querySelector('#interactive-messages');
      const interactiveQuick = document.querySelector('#interactive-quick');
      const interactiveForm = document.querySelector('#interactive-form');
      const interactiveInput = document.querySelector('#interactive-input');
      const interactiveStatus = document.querySelector('#interactive-status');
      let interactiveState = structuredClone(initialState);
      let interactiveHistory = [];
      let interactiveEstimatedCostUsd = 0;

      function appendInteractiveMessage(role, content) {
        interactiveMessages.querySelector('.empty')?.remove();
        const bubble = document.createElement('div');
        bubble.className = 'bubble ' + role;
        bubble.textContent = content;
        interactiveMessages.append(bubble);
        interactiveMessages.scrollTop = interactiveMessages.scrollHeight;
      }

      async function sendInteractiveMessage(message) {
        const cleanMessage = message.trim();
        if (!cleanMessage) return;
        appendInteractiveMessage('customer', cleanMessage);
        interactiveHistory.push({ role: 'user', content: cleanMessage });
        interactiveInput.value = '';
        interactiveInput.disabled = true;
        const response = await fetch('/api/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: cleanMessage,
            state: interactiveState,
            history: interactiveHistory.slice(-12),
          }),
        });
        const turn = await response.json();
        if (!response.ok) {
          appendInteractiveMessage('assistant', turn.error || 'The local simulator could not process that message.');
          interactiveInput.disabled = false;
          interactiveInput.focus();
          return;
        }
        interactiveState = turn.state;
        appendInteractiveMessage('assistant', turn.reply);
        interactiveHistory.push({ role: 'assistant', content: turn.reply });
        interactiveQuick.replaceChildren(...(turn.quickReplies || []).map((reply) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = reply.title;
          button.addEventListener('click', () => sendInteractiveMessage(reply.title));
          return button;
        }));
        if (turn.assistant?.estimatedCostUsd) {
          interactiveEstimatedCostUsd += turn.assistant.estimatedCostUsd;
        }
        const assistantStatus = turn.assistant
          ? ' · Model: ' + turn.assistant.model + ' · Session estimate: $' + interactiveEstimatedCostUsd.toFixed(4)
          : '';
        const previewStatus = turn.previewSource ? ' · Answer source: ' + turn.previewSource : '';
        const spendWarning = interactiveEstimatedCostUsd >= 5 ? ' · WARNING: session estimate is at least $5' : '';
        interactiveStatus.textContent = 'State: ' + turn.state.step + ' · Intent: ' + turn.interpretation.intent + assistantStatus + previewStatus + spendWarning;
        interactiveInput.disabled = false;
        interactiveInput.focus();
      }

      interactiveForm.addEventListener('submit', (event) => {
        event.preventDefault();
        sendInteractiveMessage(interactiveInput.value);
      });

      document.querySelector('#interactive-reset').addEventListener('click', () => {
        interactiveState = structuredClone(initialState);
        interactiveHistory = [];
        interactiveEstimatedCostUsd = 0;
        interactiveMessages.replaceChildren();
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'Try “Hi”, “I need a room in Newlands”, or “Show me Quarry Heights”.';
        interactiveMessages.append(empty);
        interactiveQuick.replaceChildren();
        interactiveStatus.textContent = 'State: new conversation';
        interactiveInput.value = '';
        interactiveInput.focus();
      });

      function render(key) {
        const scenario = scenarios[key];
        document.querySelector('#recorded-meta').textContent = scenario.title;
        document.querySelector('#recorded-customer').textContent = scenario.customer;
        document.querySelector('#recorded-assistant').textContent = scenario.turn.reply;
        const quick = document.querySelector('#recorded-quick');
        quick.replaceChildren(...(scenario.turn.quickReplies || []).map((reply) => {
          const item = document.createElement('span');
          item.textContent = reply.title;
          return item;
        }));
        document.querySelector('[data-field="state"]').textContent = scenario.turn.state.step;
        document.querySelector('[data-field="intent"]').textContent = scenario.turn.interpretation.intent;
        document.querySelector('[data-field="route"]').textContent = scenario.turn.routedSteps.join(' → ');
        document.querySelectorAll('nav button').forEach((button) => {
          button.setAttribute('aria-pressed', String(button.dataset.scenario === key));
        });
      }
      Object.entries(scenarios).forEach(([key, scenario]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.scenario = key;
        button.textContent = scenario.title;
        button.addEventListener('click', () => render(key));
        nav.append(button);
      });
      render('greeting');
    </script>
  </body>
</html>`;

const port = Number(process.env.AUT38_BROWSER_PORT || 3012);
async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 16_384) {
      throw new Error('Request body is too large.');
    }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function safeAssistantHistory(value: unknown): AssistantMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-12).flatMap((item): AssistantMessage[] => {
    if (!item || typeof item !== 'object') return [];
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return [];
    const cleanContent = content.trim().slice(0, 2000);
    return cleanContent ? [{ role, content: cleanContent }] : [];
  });
}

async function enhanceInteractiveQuestion(
  turn: ReturnType<typeof advanceNaturalHambaFlow>,
  history: AssistantMessage[]
) {
  if (turn.action?.type !== 'answer_property_question' || !turn.action.locationId) return turn;
  try {
    const admin = getSupabaseAdmin();
    const locationId = turn.action.locationId;
    const location = catalog.locations.find((item) => item.id === locationId);
    const propertyName = location?.name ?? turn.action.propertyInterest;
    const { data: property } = propertyName
      ? await admin.from('properties').select('id').ilike('name', `%${propertyName}%`).limit(1).maybeSingle()
      : { data: null };
    const assistant = await generatePropertyAssistantReply({
      admin,
      messages: history,
      catalog,
      propertyId: typeof property?.id === 'string' ? property.id : undefined,
    });
    const nextPrompt = prospectNextPrompt(turn.state);
    return {
      ...turn,
      reply: nextPrompt ? `${assistant.reply}\n\n${nextPrompt}` : assistant.reply,
      assistant,
      previewSource: `${assistant.provider} ${assistant.model}`,
    };
  } catch (error) {
    console.error(
      '[aut38-browser-check] Assistant preview fallback',
      error instanceof Error ? error.message : error
    );
    return {
      ...turn,
      reply: [
        buildVerifiedPropertyQuestionReply({
          locationId: turn.action.locationId,
          propertyInterest: turn.action.propertyInterest,
          query: turn.action.query,
        }),
        prospectNextPrompt(turn.state),
      ].filter(Boolean).join('\n\n'),
      previewSource: 'verified property facts',
    };
  }
}

createServer(async (request, response) => {
  if (request.method === 'POST' && request.url === '/api/turn') {
    try {
      const body = await readJsonBody(request);
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      if (!message || message.length > 1000) {
        response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'Enter a message between 1 and 1,000 characters.' }));
        return;
      }
      const state =
        body.state && typeof body.state === 'object'
          ? body.state
          : startHambaFlow().state;
      const turn = await enhanceInteractiveQuestion(
        advanceNaturalHambaFlow(state, message, catalog),
        safeAssistantHistory(body.history)
      );
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(JSON.stringify(turn));
      return;
    } catch {
      response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'The local simulator could not read that message.' }));
      return;
    }
  }

  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(page);
}).listen(port, '127.0.0.1', () => {
  console.log(`AUT-38 browser check: http://127.0.0.1:${port}`);
});
