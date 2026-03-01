import { AIModelProvider } from "./ai-model-catalog";

export interface LLMTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface LLMCallMetrics {
  provider: AIModelProvider;
  model: string;
  llmLatencyMs: number;
  usage: LLMTokenUsage;
  requestId?: string;
}

export interface LLMJsonGenerationResult {
  parsed: any;
  rawText: string;
  metrics: LLMCallMetrics;
}

export class LLMGenerationError extends Error {
  metrics?: LLMCallMetrics;
  rawText?: string;

  constructor(
    message: string,
    options?: {
      metrics?: LLMCallMetrics;
      rawText?: string;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "LLMGenerationError";
    if (options?.metrics !== undefined) {
      this.metrics = options.metrics;
    }
    if (options?.rawText !== undefined) {
      this.rawText = options.rawText;
    }

    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/```$/, "")
    .trim();
}

function parseJsonResponse(text: string): any {
  const raw = stripCodeFences(text);
  try {
    return JSON.parse(raw);
  } catch {
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first >= 0 && last > first) {
      const candidate = raw.slice(first, last + 1);
      return JSON.parse(candidate);
    }
    throw new Error("Model response is not valid JSON");
  }
}

function toNonNegativeNumber(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function buildUsage(
  inputTokens: unknown,
  outputTokens: unknown,
  totalTokens?: unknown,
): LLMTokenUsage {
  const inTokens = toNonNegativeNumber(inputTokens);
  const outTokens = toNonNegativeNumber(outputTokens);
  const explicitTotal = toNonNegativeNumber(totalTokens);
  const mergedTotal = explicitTotal > 0 ? explicitTotal : inTokens + outTokens;

  return {
    inputTokens: inTokens,
    outputTokens: outTokens,
    totalTokens: mergedTotal,
  };
}

function withOptionalRequestId(
  metrics: Omit<LLMCallMetrics, "requestId">,
  requestId: string | null,
): LLMCallMetrics {
  const trimmed = requestId?.trim();
  if (trimmed) {
    return {
      ...metrics,
      requestId: trimmed,
    };
  }
  return metrics;
}

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<LLMJsonGenerationResult> {
  const startedAt = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  const completedAt = Date.now();

  const body = await res.json().catch(() => ({}));
  const metrics: LLMCallMetrics = withOptionalRequestId(
    {
      provider: "openai",
      model,
      llmLatencyMs: completedAt - startedAt,
      usage: buildUsage(
        body?.usage?.prompt_tokens,
        body?.usage?.completion_tokens,
        body?.usage?.total_tokens,
      ),
    },
    res.headers.get("x-request-id"),
  );

  if (!res.ok) {
    throw new LLMGenerationError(
      `OpenAI error ${res.status}: ${JSON.stringify(body)}`,
      { metrics },
    );
  }

  const content = body?.choices?.[0]?.message?.content;
  if (!content) {
    throw new LLMGenerationError("OpenAI returned empty content", { metrics });
  }

  try {
    return {
      parsed: parseJsonResponse(content),
      rawText: content,
      metrics,
    };
  } catch (error) {
    throw new LLMGenerationError("OpenAI returned non-JSON content", {
      metrics,
      rawText: content,
      cause: error,
    });
  }
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<LLMJsonGenerationResult> {
  const startedAt = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `${userPrompt}\n\nReturn ONLY a valid JSON object and no markdown.`,
        },
      ],
    }),
  });
  const completedAt = Date.now();

  const body = await res.json().catch(() => ({}));
  const metrics: LLMCallMetrics = withOptionalRequestId(
    {
      provider: "anthropic",
      model,
      llmLatencyMs: completedAt - startedAt,
      usage: buildUsage(
        body?.usage?.input_tokens,
        body?.usage?.output_tokens,
        body?.usage?.input_tokens && body?.usage?.output_tokens
          ? Number(body?.usage?.input_tokens) + Number(body?.usage?.output_tokens)
          : undefined,
      ),
    },
    res.headers.get("request-id"),
  );

  if (!res.ok) {
    throw new LLMGenerationError(
      `Anthropic error ${res.status}: ${JSON.stringify(body)}`,
      { metrics },
    );
  }

  const content = Array.isArray(body?.content)
    ? body.content
        .filter((part: any) => part?.type === "text")
        .map((part: any) => part?.text || "")
        .join("\n")
        .trim()
    : "";

  if (!content) {
    throw new LLMGenerationError("Anthropic returned empty content", {
      metrics,
    });
  }

  try {
    return {
      parsed: parseJsonResponse(content),
      rawText: content,
      metrics,
    };
  } catch (error) {
    throw new LLMGenerationError("Anthropic returned non-JSON content", {
      metrics,
      rawText: content,
      cause: error,
    });
  }
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<LLMJsonGenerationResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const startedAt = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
  });
  const completedAt = Date.now();

  const body = await res.json().catch(() => ({}));
  const metrics: LLMCallMetrics = {
    provider: "gemini",
    model,
    llmLatencyMs: completedAt - startedAt,
    usage: buildUsage(
      body?.usageMetadata?.promptTokenCount,
      body?.usageMetadata?.candidatesTokenCount,
      body?.usageMetadata?.totalTokenCount,
    ),
  };

  if (!res.ok) {
    throw new LLMGenerationError(
      `Gemini error ${res.status}: ${JSON.stringify(body)}`,
      { metrics },
    );
  }

  const content =
    body?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p?.text || "")
      .join("\n")
      .trim() || "";

  if (!content) {
    throw new LLMGenerationError("Gemini returned empty content", { metrics });
  }

  try {
    return {
      parsed: parseJsonResponse(content),
      rawText: content,
      metrics,
    };
  } catch (error) {
    throw new LLMGenerationError("Gemini returned non-JSON content", {
      metrics,
      rawText: content,
      cause: error,
    });
  }
}

export async function generateJsonWithModel(params: {
  provider: AIModelProvider;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<LLMJsonGenerationResult> {
  const { provider, apiKey, model, systemPrompt, userPrompt } = params;
  switch (provider) {
    case "openai":
      return callOpenAI(apiKey, model, systemPrompt, userPrompt);
    case "anthropic":
      return callAnthropic(apiKey, model, systemPrompt, userPrompt);
    case "gemini":
      return callGemini(apiKey, model, systemPrompt, userPrompt);
    default:
      throw new Error(`Unsupported provider: ${provider as string}`);
  }
}
