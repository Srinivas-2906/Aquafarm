import { z } from 'zod';

export const apiEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  OTP_MOCK_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  OTP_MOCK_CODE: z.string().default('123456'),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function validateApiEnv(env: Record<string, string | undefined>): ApiEnv {
  const result = apiEnvSchema.safeParse(env);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    throw new Error(`Invalid API environment: ${JSON.stringify(errors)}`);
  }
  return result.data;
}
