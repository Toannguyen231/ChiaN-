import 'dotenv/config';
import { vnPhoneSchema } from '@chiane/shared';
import { z } from 'zod';

const optionalSetting = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(value => value === '' ? undefined : value, schema.optional());

const storageUrl = z.string().url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.search && !url.hash && !url.username && !url.password;
}, 'Storage URLs must be HTTPS without credentials, query or fragment');

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().min(1).default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().min(1).default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  OTP_PROVIDER: z.enum(['console', 'esms', 'zalo_zns']).default('console'),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(30),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_DEV_ECHO: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  ANDROID_APP_SHA256: optionalSetting(z.string().trim().regex(
    /^(?:[\da-f]{2}:){31}[\da-f]{2}(?:\s*,\s*(?:[\da-f]{2}:){31}[\da-f]{2})*$/i,
    'Expected comma-separated SHA-256 certificate fingerprints'
  )),
  REVIEWER_DEMO_PHONE: optionalSetting(vnPhoneSchema),
  REVIEWER_DEMO_OTP: optionalSetting(z.string().regex(/^\d{6}$/)),
  SUPPORT_EMAIL: optionalSetting(z.string().trim().email()),
  S3_ENDPOINT: optionalSetting(storageUrl),
  S3_BUCKET: optionalSetting(z.string().regex(/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/)),
  S3_ACCESS_KEY_ID: optionalSetting(z.string().trim().min(1)),
  S3_SECRET_ACCESS_KEY: optionalSetting(z.string().min(1)),
  S3_PUBLIC_BASE_URL: optionalSetting(storageUrl),
  S3_REGION: optionalSetting(z.string().regex(/^[a-z0-9-]+$/)),
  GEMINI_API_KEY: z.string().optional(),
  ESMS_API_KEY: z.string().optional(),
  ESMS_SECRET_KEY: z.string().optional(),
  ESMS_BRANDNAME: z.string().optional(),
  ZALO_ZNS_ACCESS_TOKEN: z.string().optional(),
  ZALO_ZNS_TEMPLATE_ID: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(rawEnv: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(rawEnv);

  if (parsed.NODE_ENV === 'production' && parsed.OTP_DEV_ECHO) {
    throw new Error('SECURITY VIOLATION: OTP_DEV_ECHO must be false when NODE_ENV=production');
  }

  return parsed;
}
