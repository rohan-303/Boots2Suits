import { z } from "zod";

const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
  AUTH_COOKIE_NAME: z.string().min(1).default("boots2suits_session"),
  AUTH_COOKIE_SECURE: z
    .union([z.literal("true"), z.literal("false")])
    .default("false")
    .transform((value) => value === "true"),
  AUTH_SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  AUTH_TOKEN_PEPPER: z.string().min(16, "AUTH_TOKEN_PEPPER must be at least 16 chars"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  EMBEDDINGS_ENABLED: z
    .union([z.literal("true"), z.literal("false")])
    .default("false")
    .transform((value) => value === "true"),
  EMBEDDINGS_PROVIDER: z.enum(["none", "openai"]).default("none"),
  EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  EMBEDDINGS_MODEL: z.string().optional(),
  EMBEDDINGS_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  EMBEDDINGS_API_KEY: z.string().optional(),
  MATCH_SEMANTIC_WEIGHT: z.coerce.number().min(0).max(1).default(0.6),
  MATCH_RULE_WEIGHT: z.coerce.number().min(0).max(1).default(0.4),
  MATCH_EMBEDDING_BLEND_WEIGHT: z.coerce.number().min(0).max(1).default(0.8),
  MATCH_STRUCTURED_BLEND_WEIGHT: z.coerce.number().min(0).max(1).default(0.2),
  QUEUE_JOB_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  QUEUE_JOB_BACKOFF_MS: z.coerce.number().int().min(250).max(300000).default(2000),
  QUEUE_RESUME_JOB_ATTEMPTS: z.coerce.number().int().min(1).max(10).optional(),
  QUEUE_RESUME_JOB_BACKOFF_MS: z.coerce.number().int().min(250).max(300000).optional(),
  QUEUE_MATCHING_JOB_ATTEMPTS: z.coerce.number().int().min(1).max(10).optional(),
  QUEUE_MATCHING_JOB_BACKOFF_MS: z.coerce.number().int().min(250).max(300000).optional(),
  QUEUE_EMBEDDING_JOB_ATTEMPTS: z.coerce.number().int().min(1).max(10).optional(),
  QUEUE_EMBEDDING_JOB_BACKOFF_MS: z.coerce.number().int().min(250).max(300000).optional(),
  QUEUE_CONNECTOR_JOB_ATTEMPTS: z.coerce.number().int().min(1).max(10).optional(),
  QUEUE_CONNECTOR_JOB_BACKOFF_MS: z.coerce.number().int().min(250).max(300000).optional(),
  QUEUE_REPLAY_MAX_PER_JOB: z.coerce.number().int().min(1).max(20).default(3)
}).superRefine((env, ctx) => {
  const hybridTotal = env.MATCH_SEMANTIC_WEIGHT + env.MATCH_RULE_WEIGHT;
  if (Math.abs(hybridTotal - 1) > 0.0001) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "MATCH_SEMANTIC_WEIGHT + MATCH_RULE_WEIGHT must equal 1.0"
    });
  }
  const blendTotal = env.MATCH_EMBEDDING_BLEND_WEIGHT + env.MATCH_STRUCTURED_BLEND_WEIGHT;
  if (Math.abs(blendTotal - 1) > 0.0001) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "MATCH_EMBEDDING_BLEND_WEIGHT + MATCH_STRUCTURED_BLEND_WEIGHT must equal 1.0"
    });
  }
});

export const env = envSchema.parse(process.env);
