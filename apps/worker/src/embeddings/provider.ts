import { z } from "zod";

export type EmbeddingMode = "real_embeddings" | "structured_fallback";

export type EmbeddingsProvider = {
  mode: EmbeddingMode;
  modelVersion: string;
  generateEmbedding: (text: string) => Promise<number[] | null>;
};

const envSchema = z.object({
  EMBEDDINGS_PROVIDER: z.enum(["none", "openai"]).default("none"),
  EMBEDDINGS_MODEL: z.string().min(1).default("text-embedding-3-small"),
  EMBEDDINGS_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  EMBEDDINGS_API_KEY: z.string().optional()
});

type OpenAiEmbeddingsResponse = {
  data?: Array<{
    embedding?: number[];
  }>;
};

function fallbackProvider(): EmbeddingsProvider {
  return {
    mode: "structured_fallback",
    modelVersion: "structured-fallback-v1",
    async generateEmbedding() {
      return null;
    }
  };
}

export function createEmbeddingsProviderFromEnv(): EmbeddingsProvider {
  const env = envSchema.parse(process.env);

  if (env.EMBEDDINGS_PROVIDER !== "openai" || !env.EMBEDDINGS_API_KEY) {
    return fallbackProvider();
  }

  const baseUrl = env.EMBEDDINGS_BASE_URL.replace(/\/$/, "");
  const model = env.EMBEDDINGS_MODEL;

  return {
    mode: "real_embeddings",
    modelVersion: `openai:${model}`,
    async generateEmbedding(text: string) {
      const input = text.trim();
      if (!input) return null;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetch(`${baseUrl}/embeddings`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.EMBEDDINGS_API_KEY}`
          },
          body: JSON.stringify({
            model,
            input
          })
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(`Embedding provider error (${response.status}): ${body || "unknown error"}`);
        }

        const payload = (await response.json()) as OpenAiEmbeddingsResponse;
        const vector = payload.data?.[0]?.embedding;
        if (!Array.isArray(vector) || vector.length === 0) {
          throw new Error("Embedding provider returned an empty vector.");
        }
        return vector.map((value) => Number(value));
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
