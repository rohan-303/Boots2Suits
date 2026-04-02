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
  REDIS_URL: z.string().url().default("redis://localhost:6379")
});

export const env = envSchema.parse(process.env);
