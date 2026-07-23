export type AssistantModelOption = {
  value: string;
  label: string;
  description: string;
  contextWindow: number | null;
  maxOutput: number | null;
  inputPricePerM: number | null;
  outputPricePerM: number | null;
  badge?: string;
};

export type AssistantProviderOption = {
  value: string;
  label: string;
  models: AssistantModelOption[];
};

export const DEFAULT_ASSISTANT_PROVIDER = 'openai';
export const DEFAULT_ASSISTANT_MODEL = 'gpt-5.6-luna';

export const ASSISTANT_PROVIDERS: AssistantProviderOption[] = [
  {
    value: 'openai',
    label: 'OpenAI GPT',
    models: [
      {
        value: 'gpt-5.6-luna',
        label: 'GPT-5.6 Luna',
        description: 'Fast and cost-efficient for high-volume business chat',
        contextWindow: 400_000,
        maxOutput: 128_000,
        inputPricePerM: 1,
        outputPricePerM: 6,
        badge: 'Recommended',
      },
      {
        value: 'gpt-5.6-terra',
        label: 'GPT-5.6 Terra',
        description: 'Balanced intelligence, speed, and cost',
        contextWindow: 1_050_000,
        maxOutput: 128_000,
        inputPricePerM: 2.5,
        outputPricePerM: 15,
        badge: 'Balanced',
      },
      {
        value: 'gpt-5.6-sol',
        label: 'GPT-5.6 Sol',
        description: 'Highest capability for difficult quality-first work',
        contextWindow: 1_050_000,
        maxOutput: 128_000,
        inputPricePerM: 5,
        outputPricePerM: 30,
        badge: 'Frontier',
      },
      {
        value: 'gpt-5.5',
        label: 'GPT-5.5',
        description: 'Previous flagship generation',
        contextWindow: 1_050_000,
        maxOutput: 128_000,
        inputPricePerM: 5,
        outputPricePerM: 30,
      },
      {
        value: 'gpt-5.4',
        label: 'GPT-5.4',
        description: 'Previous general-purpose generation',
        contextWindow: 1_050_000,
        maxOutput: 128_000,
        inputPricePerM: 2.5,
        outputPricePerM: 15,
      },
      {
        value: 'gpt-5.4-mini',
        label: 'GPT-5.4 Mini',
        description: 'Lower-cost GPT-5.4 model',
        contextWindow: 400_000,
        maxOutput: 128_000,
        inputPricePerM: 0.75,
        outputPricePerM: 4.5,
      },
      {
        value: 'gpt-5.4-nano',
        label: 'GPT-5.4 Nano',
        description: 'Smallest GPT-5.4 model',
        contextWindow: 400_000,
        maxOutput: 128_000,
        inputPricePerM: 0.2,
        outputPricePerM: 1.25,
      },
    ],
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    models: [
      {
        value: 'deepseek-v4',
        label: 'DeepSeek V4',
        description: 'Configured DeepSeek flagship route',
        contextWindow: null,
        maxOutput: null,
        inputPricePerM: null,
        outputPricePerM: null,
      },
      {
        value: 'deepseek-chat',
        label: 'DeepSeek Chat',
        description: 'Configured DeepSeek chat route',
        contextWindow: null,
        maxOutput: null,
        inputPricePerM: null,
        outputPricePerM: null,
      },
    ],
  },
];

export function getAssistantProvider(provider: string) {
  return ASSISTANT_PROVIDERS.find((option) => option.value === provider) ?? ASSISTANT_PROVIDERS[0];
}

export function getAssistantModel(provider: string, model: string) {
  const providerOption = getAssistantProvider(provider);
  return providerOption.models.find((option) => option.value === model) ?? providerOption.models[0];
}

export function getAssistantModelPricing(model: string) {
  for (const provider of ASSISTANT_PROVIDERS) {
    const found = provider.models.find((option) => option.value === model);
    if (found?.inputPricePerM != null && found.outputPricePerM != null) {
      return { input: found.inputPricePerM, output: found.outputPricePerM };
    }
  }
  return null;
}
