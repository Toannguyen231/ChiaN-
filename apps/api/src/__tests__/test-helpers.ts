import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { UserProfile } from '@chiane/shared';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env';
import type { OtpDeliveryProvider } from '../services/otp.service';

export class CaptureOtpProvider implements OtpDeliveryProvider {
  public lastSent: { phone: string; code: string; ttlSeconds: number } | null = null;
  public byPhone = new Map<string, string>();

  async sendOtp(phone: string, code: string, ttlSeconds: number): Promise<void> {
    this.lastSent = { phone, code, ttlSeconds };
    this.byPhone.set(phone, code);
  }
}

export function createTestDb(suiteName: string): {
  dbFile: string;
  databaseUrl: string;
  config: AppConfig;
  initPrisma: () => Promise<PrismaClient>;
  cleanupDb: (prisma: PrismaClient | undefined) => Promise<void>;
} {
  const dbFile = path.resolve(__dirname, `../../prisma/test-${suiteName}.db`);
  const databaseUrl = `file:${dbFile.replace(/\\/g, '/')}`;

  const config: AppConfig = {
    PORT: 0,
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: 'chiane-test-jwt-secret-must-be-at-least-32-chars',
    JWT_ACCESS_TTL: '15m',
    REFRESH_TOKEN_TTL_DAYS: 30,
    OTP_PROVIDER: 'console',
    OTP_TTL_SECONDS: 300,
    OTP_RESEND_COOLDOWN_SECONDS: 30,
    OTP_MAX_ATTEMPTS: 5,
    OTP_DEV_ECHO: true,
  };

  async function initPrisma(): Promise<PrismaClient> {
    if (fs.existsSync(dbFile)) {
      fs.unlinkSync(dbFile);
    }

    const schemaFile = path.resolve(__dirname, '../../prisma/schema.prisma');
    const templateFile = path.resolve(__dirname, '../../prisma/test-template.db');
    const templateUrl = `file:${templateFile.replace(/\\/g, '/')}`;

    const needsTemplateRebuild =
      !fs.existsSync(templateFile) ||
      fs.statSync(schemaFile).mtimeMs > fs.statSync(templateFile).mtimeMs;

    if (needsTemplateRebuild) {
      if (fs.existsSync(templateFile)) {
        fs.unlinkSync(templateFile);
      }
      const prismaCli = path.resolve(__dirname, '../../node_modules/.bin/prisma.cmd');
      const resolvedCli = fs.existsSync(prismaCli) ? prismaCli : 'npx';
      const args = fs.existsSync(prismaCli)
        ? ['db', 'push', '--skip-generate']
        : ['prisma', 'db', 'push', '--skip-generate'];

      execFileSync(resolvedCli, args, {
        cwd: path.resolve(__dirname, '../..'),
        env: { ...process.env, DATABASE_URL: templateUrl },
        stdio: 'pipe',
        shell: true,
      });
    }

    fs.copyFileSync(templateFile, dbFile);

    const prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });
    await prisma.$connect();
    return prisma;
  }

  async function cleanupDb(prisma: PrismaClient | undefined): Promise<void> {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (fs.existsSync(dbFile)) {
      try {
        fs.unlinkSync(dbFile);
      } catch {
        // Ignore locked Windows handle cleanup
      }
    }
  }

  return { dbFile, databaseUrl, config, initPrisma, cleanupDb };
}

export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.activityLog.deleteMany();
  await prisma.paymentReminder.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.expenseSplit.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.otpChallenge.deleteMany();
  await prisma.user.deleteMany();
}

export async function createAuthedUser(
  app: FastifyInstance,
  otpProvider: CaptureOtpProvider,
  phone: string,
  displayName: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
  authHeader: { authorization: string };
}> {
  const reqRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/otp/request',
    payload: { phone },
  });
  if (reqRes.statusCode !== 200) {
    throw new Error(`Failed OTP request for ${phone}: ${reqRes.body}`);
  }
  const normalizedPhone = (reqRes.json() as { phone: string }).phone;
  const code = otpProvider.byPhone.get(normalizedPhone) ?? otpProvider.lastSent?.code;
  if (!code) {
    throw new Error(`Missing captured OTP for ${phone}`);
  }

  const verifyRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/otp/verify',
    payload: { phone, code },
  });
  if (verifyRes.statusCode !== 200) {
    throw new Error(`Failed OTP verify for ${phone}: ${verifyRes.body}`);
  }

  const verified = verifyRes.json() as {
    accessToken: string;
    refreshToken: string;
    user: UserProfile;
  };

  let finalUser = verified.user;
  if (displayName) {
    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${verified.accessToken}` },
      payload: { displayName },
    });
    if (patchRes.statusCode !== 200) {
      throw new Error(`Failed profile update for ${phone}: ${patchRes.body}`);
    }
    finalUser = (patchRes.json() as { user: UserProfile }).user;
  }

  return {
    accessToken: verified.accessToken,
    refreshToken: verified.refreshToken,
    user: finalUser,
    authHeader: { authorization: `Bearer ${verified.accessToken}` },
  };
}
