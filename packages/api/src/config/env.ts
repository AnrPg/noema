// =============================================================================
// ENVIRONMENT CONFIGURATION
// =============================================================================

import { z } from "zod";

const envSchema = z.object({
  // Server
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("0.0.0.0"),
  API_URL: z.string().default("http://localhost:3001"),

  // Database
  DATABASE_URL: z.string(),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default("7d"),
  REFRESH_TOKEN_EXPIRY: z.string().default("30d"),

  // Storage (MinIO/S3)
  MINIO_ENDPOINT: z.string().default("localhost"),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  MINIO_USE_SSL: z
    .string()
    .default("false")
    .transform((val) => val === "true"),
  MINIO_BUCKET: z.string().default("manthanein"),

  // CORS
  CORS_ORIGINS: z
    .string()
    .default("*")
    .transform((val) => (val === "*" ? true : val.split(","))),

  // AI Service
  AI_SERVICE_URL: z.string().default("http://localhost:8000"),

  // Vector Database (Qdrant)
  QDRANT_URL: z.string().default("http://localhost:6333"),

  // OAuth (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
});

function validateEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    process.exit(1);
  }

  return parsed.data;
}

export const env = validateEnv();

export type Env = z.infer<typeof envSchema>;
