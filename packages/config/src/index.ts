import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  MODEL_ENCRYPTION_KEY: z.string().min(44),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(20971520),
  PORT: z.coerce.number().int().positive().default(3001),
  CHAT_HISTORY_TOKENS: z.coerce.number().int().positive().default(4000),
});
export type AppConfig = z.infer<typeof schema>;
export const loadConfig = (source: NodeJS.ProcessEnv = process.env): AppConfig =>
  schema.parse(source);
