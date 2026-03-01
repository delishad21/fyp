export type AIModelProvider = "openai" | "anthropic" | "gemini";

export interface AIModelDescriptor {
  id: string;
  provider: AIModelProvider;
  model: string;
  label: string;
  description: string;
}

const PROVIDER_KEYS: Record<AIModelProvider, string[]> = {
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
};

const AI_MODEL_CATALOG: AIModelDescriptor[] = [
  {
    id: "openai-gpt-5-mini",
    provider: "openai",
    model: "gpt-5-mini",
    label: "OpenAI GPT-5 mini",
    description:
      "Fast, cost-efficient baseline for structured quiz generation with strong instruction-following.",
  },
  {
    id: "anthropic-claude-haiku-3-5",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    description:
      "Low-latency, lower-cost Claude option for faster generation while keeping good quality.",
  },
  {
    id: "google-gemini-2-5-flash",
    provider: "gemini",
    model: "gemini-2.5-flash",
    label: "Google Gemini 2.5 Flash",
    description:
      "Fast, price-performance Gemini model for high-throughput generation and iteration.",
  },
];

export function getConfiguredProviderApiKey(
  provider: AIModelProvider,
): string | null {
  const envNames = PROVIDER_KEYS[provider];
  for (const envName of envNames) {
    const key = process.env[envName];
    if (key && key.trim().length > 0) return key.trim();
  }
  return null;
}

export function getAvailableAIModels(): AIModelDescriptor[] {
  return AI_MODEL_CATALOG.filter(
    (model) => !!getConfiguredProviderApiKey(model.provider),
  );
}

export function resolveSelectedAIModel(
  modelId?: string,
): AIModelDescriptor | null {
  const available = getAvailableAIModels();
  if (available.length === 0) return null;

  if (!modelId) return available[0] || null;

  const selected = available.find((m) => m.id === modelId);
  return selected || null;
}
