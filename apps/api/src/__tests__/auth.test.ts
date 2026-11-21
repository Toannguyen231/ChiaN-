import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import type { AppConfig } from '../config/env';
import type { OtpDeliveryProvider } from '../services/otp.service';

const TEST_DB_FILE = path.resolve(__dirname, '../../prisma/test.db');
const TEST_DATABASE_URL = `file:${TEST_DB_FILE.replace(/\\/g, '/')}`;

const baseConfig: AppConfig = {
  PORT: 0,
  HOST: '127.0.0.1',
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_ACCESS_SECRET: 'chiane-test-jwt-secret-must-be-at-least-32-chars',
  JWT_ACCESS_TTL: '15m',
  REFRESH_TOKEN_TTL_DAYS: 30,
  OTP_PROVIDER: 'console',
  OTP_TTL_SECONDS: 300,
  OTP_RESEND_COOLDOWN_SECONDS: 30,
  OTP_MAX_ATTEMPTS: 3,
  OTP_DEV_ECHO: true,
};

class CaptureOtpProvider implements OtpDeliveryProvider {
  public lastSent: { phone: string; code: string; ttlSeconds: number } | null = null;

  async sendOtp(phone: string, code: string, ttlSeconds: number): Promise<void> {
    this.lastSent = { phone, code, ttlSeconds };
  }
}

describe('ChiaNè Auth & Foundation API (Module 01)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let otpProvider: CaptureOtpProvider;

  beforeAll(async () => {
    if (fs.existsSync(TEST_DB_FILE)) {
      fs.unlinkSync(TEST_DB_FILE);
    }

    const prismaCli = path.resolve(__dirname, '../../node_modules/.bin/prisma.cmd');
    const resolvedCli = fs.existsSync(prismaCli) ? prismaCli : 'npx';
    const args = fs.existsSync(prismaCli)
      ? ['db', 'push', '--skip-generate']
      : ['prisma', 'db', 'push', '--skip-generate'];

    execFileSync(resolvedCli, args, {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'pipe',
      shell: true,
    });

    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
    });
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.otpChallenge.deleteMany();
    await prisma.user.deleteMany();

    otpProvider = new CaptureOtpProvider();
    app = await buildApp({
      config: { ...baseConfig },
      prisma,
      otpProvider,
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (prisma) {
      await prisma.$disconnect();
    }
    if (fs.existsSync(TEST_DB_FILE)) {
      try {
        fs.unlinkSync(TEST_DB_FILE);
      } catch {
        // Ignore locked Windows handle cleanup
      }
    }
  });

  it('responds ok on GET /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('chiane-api');
  });

  it('rejects invalid Vietnamese phone numbers with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/request',
      payload: { phone: '0123456789' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('issues OTP and enforces resend cooldown (429 OTP_COOLDOWN)', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/request',
      payload: { phone: '0912 345 678' },
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json();
    expect(firstBody.phone).toBe('+84912345678');
    expect(firstBody.maskedPhone).toBe('0912 ••• 678');
    expect(firstBody.devOtp).toMatch(/^\d{6}$/);
    expect(otpProvider.lastSent?.code).toBe(firstBody.devOtp);

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/request',
      payload: { phone: '+84912345678' },
    });
    expect(second.statusCode).toBe(429);
    expect(second.json().error.code).toBe('OTP_COOLDOWN');
    expect(second.json().error.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('rejects wrong OTP and locks out after max attempts', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/request',
      payload: { phone: '912345678' },
    });
    const realCode = otpProvider.lastSent!.code;
    const wrongCode = realCode === '000000' ? '111111' : '000000';

    const fail1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone: '+84912345678', code: wrongCode },
    });
    expect(fail1.statusCode).toBe(401);
    expect(fail1.json().error.code).toBe('OTP_INVALID');
    expect(fail1.json().error.details.remainingAttempts).toBe(2);

    const fail2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone: '+84912345678', code: wrongCode },
    });
    expect(fail2.statusCode).toBe(401);
    expect(fail2.json().error.details.remainingAttempts).toBe(1);

    const fail3 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone: '+84912345678', code: wrongCode },
    });
    expect(fail3.statusCode).toBe(429);
    expect(fail3.json().error.code).toBe('OTP_MAX_ATTEMPTS');

    // Even valid code after lockout is rejected until requesting a new challenge
    const afterLockout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone: '+84912345678', code: realCode },
    });
    expect(afterLockout.statusCode).toBe(429);
    expect(afterLockout.json().error.code).toBe('OTP_MAX_ATTEMPTS');
  });

  it('rejects expired OTP challenges with 401 OTP_EXPIRED', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/request',
      payload: { phone: '0912345678' },
    });
    const code = otpProvider.lastSent!.code;

    await prisma.otpChallenge.updateMany({
      where: { phone: '+84912345678' },
      data: { expiresAt: new Date(Date.now() - 10_000) },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone: '0912345678', code },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('OTP_EXPIRED');
  });

  it('completes full auth lifecycle: verify -> me GET/PATCH -> refresh rotation -> reuse detection -> logout', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/request',
      payload: { phone: '0912345678' },
    });
    const code = otpProvider.lastSent!.code;

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone: '0912345678', code },
    });
    expect(verifyRes.statusCode).toBe(200);
    const verified = verifyRes.json();
    expect(verified.isNewUser).toBe(true);
    expect(verified.user.phone).toBe('+84912345678');
    expect(verified.accessToken).toBeTruthy();
    expect(verified.refreshToken).toBeTruthy();

    // Update profile displayName & bank info
    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${verified.accessToken}` },
      payload: {
        displayName: 'Nguyễn An',
        bankBin: '970422',
        bankName: 'MB Bank',
        bankAccountNumber: '0123456789',
        bankAccountHolder: 'NGUYEN AN',
      },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().user.displayName).toBe('Nguyễn An');
    expect(patchRes.json().user.bankBin).toBe('970422');

    // Fetch /me
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${verified.accessToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().user.displayName).toBe('Nguyễn An');

    // Rotate refresh token
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: verified.refreshToken },
    });
    expect(refreshRes.statusCode).toBe(200);
    const rotated = refreshRes.json();
    expect(rotated.refreshToken).not.toBe(verified.refreshToken);

    // Replaying old refresh token triggers REFRESH_TOKEN_REUSE and revokes new token too
    const replayRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: verified.refreshToken },
    });
    expect(replayRes.statusCode).toBe(401);
    expect(replayRes.json().error.code).toBe('REFRESH_TOKEN_REUSE');

    const revokedNewRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: rotated.refreshToken },
    });
    expect(revokedNewRes.statusCode).toBe(401);
  });

  it('revokes refresh token on logout', async () => {
    const noCooldownApp = await buildApp({
      config: { ...baseConfig, OTP_RESEND_COOLDOWN_SECONDS: 0 },
      prisma,
      otpProvider,
    });

    await noCooldownApp.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/request',
      payload: { phone: '0987654321' },
    });
    const verifyRes = await noCooldownApp.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone: '0987654321', code: otpProvider.lastSent!.code },
    });
    const { refreshToken } = verifyRes.json();

    const logoutRes = await noCooldownApp.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken },
    });
    expect(logoutRes.statusCode).toBe(200);

    const afterLogout = await noCooldownApp.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });
    expect(afterLogout.statusCode).toBe(401);
    await noCooldownApp.close();
  });
});
