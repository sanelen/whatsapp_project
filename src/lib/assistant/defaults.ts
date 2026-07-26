export const DEFAULT_ASSISTANT_GREETING = [
  'Hi 👋 Welcome to Hamba Trading Property Rentals.',
  'How can I help you today?',
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
