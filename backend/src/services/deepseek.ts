export type DeepSeekRole = "system" | "user" | "assistant";

export interface DeepSeekMessage {
  role: DeepSeekRole;
  content: string;
}

export interface DeepSeekCompletion {
  provider: "deepseek";
  model: string;
  content: string;
}

interface DeepSeekClientOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface DeepSeekResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_TIMEOUT_MS = 8_000;

export function createDeepSeekClient(options: DeepSeekClientOptions = {}) {
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY;
  const baseUrl = stripTrailingSlash(options.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? DEFAULT_BASE_URL);
  const model = options.model ?? process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? readPositiveInt(process.env.DEEPSEEK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return {
    isConfigured: Boolean(apiKey),
    model,
    async chat(messages: DeepSeekMessage[]): Promise<DeepSeekCompletion | null> {
      if (!apiKey) {
        return null;
      }
      if (!fetchImpl) {
        throw new Error("global fetch is not available for DeepSeek requests");
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages,
            stream: false
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`DeepSeek request failed: HTTP ${response.status} ${text.slice(0, 200)}`);
        }

        const data = (await response.json()) as DeepSeekResponse;
        const content = data.choices?.[0]?.message?.content?.trim();
        if (!content) {
          throw new Error("DeepSeek response does not contain assistant content");
        }

        return {
          provider: "deepseek",
          model: data.model ?? model,
          content
        };
      } finally {
        clearTimeout(timer);
      }
    }
  };
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
