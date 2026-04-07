type Provider = "openai" | "anthropic" | "gemini";

type ModelPricing = {
  provider: Provider;
  inputUsdPer1M: number;
  outputUsdPer1M: number;
};

export type UsageLike = {
  inputTokens?: number;
  outputTokens?: number;
};

export type PricedUsageResult = {
  estimatedUsd: number;
  inputRateUsdPer1M: number;
  outputRateUsdPer1M: number;
  usedLongContextRate: boolean;
};

// USD per 1M tokens (standard tier text pricing).
// Sources:
// - OpenAI: https://openai.com/api/pricing
// - Anthropic: https://docs.anthropic.com/en/docs/about-claude/pricing
// - Gemini: https://ai.google.dev/gemini-api/docs/pricing
const MODEL_PRICING_BY_PROVIDER_MODEL = new Map<string, ModelPricing>([
  [
    "openai:gpt-5-mini",
    { provider: "openai", inputUsdPer1M: 0.25, outputUsdPer1M: 2.0 },
  ],
  [
    "anthropic:claude-haiku-4-5-20251001",
    { provider: "anthropic", inputUsdPer1M: 1.0, outputUsdPer1M: 5.0 },
  ],
  [
    "gemini:gemini-2.5-flash",
    { provider: "gemini", inputUsdPer1M: 0.3, outputUsdPer1M: 2.5 },
  ],
]);

function toFiniteNonNegative(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function normalizeKey(provider: string, model: string): string {
  return `${provider.trim().toLowerCase()}:${model.trim().toLowerCase()}`;
}

function maybeResolvePricing(provider: string, model: string): ModelPricing | null {
  const key = normalizeKey(provider, model);
  const direct = MODEL_PRICING_BY_PROVIDER_MODEL.get(key);
  if (direct) return direct;

  if (key.startsWith("openai:gpt-5-mini")) {
    return MODEL_PRICING_BY_PROVIDER_MODEL.get("openai:gpt-5-mini") || null;
  }
  if (key.startsWith("anthropic:claude-haiku-4-5")) {
    return (
      MODEL_PRICING_BY_PROVIDER_MODEL.get("anthropic:claude-haiku-4-5-20251001") ||
      null
    );
  }
  if (key.startsWith("anthropic:claude-3-5-haiku")) {
    return (
      MODEL_PRICING_BY_PROVIDER_MODEL.get("anthropic:claude-haiku-4-5-20251001") ||
      null
    );
  }
  if (key.startsWith("gemini:gemini-2.5-flash")) {
    return MODEL_PRICING_BY_PROVIDER_MODEL.get("gemini:gemini-2.5-flash") || null;
  }

  return null;
}

export function estimateUsageCostUsd(params: {
  provider: string;
  model: string;
  usage: UsageLike | null | undefined;
}): PricedUsageResult | null {
  const pricing = maybeResolvePricing(params.provider, params.model);
  if (!pricing) return null;

  const inputTokens = toFiniteNonNegative(params.usage?.inputTokens);
  const outputTokens = toFiniteNonNegative(params.usage?.outputTokens);

  const estimatedUsd =
    (inputTokens / 1_000_000) * pricing.inputUsdPer1M +
    (outputTokens / 1_000_000) * pricing.outputUsdPer1M;

  return {
    estimatedUsd,
    inputRateUsdPer1M: pricing.inputUsdPer1M,
    outputRateUsdPer1M: pricing.outputUsdPer1M,
    usedLongContextRate: false,
  };
}

export function getModelPricingRows(): Array<{
  provider: Provider;
  model: string;
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  longContextInputUsdPer1M?: number;
  longContextOutputUsdPer1M?: number;
}> {
  return Array.from(MODEL_PRICING_BY_PROVIDER_MODEL.entries()).map(
    ([key, value]) => {
      const model = key.slice(key.indexOf(":") + 1);
      return {
        provider: value.provider,
        model,
        inputUsdPer1M: value.inputUsdPer1M,
        outputUsdPer1M: value.outputUsdPer1M,
      };
    },
  );
}
