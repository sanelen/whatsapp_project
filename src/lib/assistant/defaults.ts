export const DEFAULT_ASSISTANT_GREETING = [
  'Hi 👋 Welcome to Hamba Trading.',
  '',
  'I’m your property assistant. Tell me what you need in your own words — I can help you explore our properties, see photos and pamphlets, arrange a viewing, or get support as an existing tenant.',
  '',
  'You can type HUMAN at any time to speak to a person.',
].join('\n');

export function resolveAssistantGreeting(templates: string[] | null | undefined) {
  const candidate = templates?.[0]?.trim() ?? '';
  return candidate && candidate.toLowerCase() !== 'welcome message'
    ? candidate.slice(0, 1400)
    : DEFAULT_ASSISTANT_GREETING;
}

export function replaceAssistantGreeting(templates: string[], greeting: string) {
  return [greeting.slice(0, 1400), ...templates.slice(1)];
}
