import { loadConfig } from '../config/env';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import {
  CaptureOtpProvider,
  createAuthedUser,
  createTestDb,
  resetDb,
} from './test-helpers';

const testDb = createTestDb('auth');
const baseConfig = { ...testDb.config, OTP_MAX_ATTEMPTS: 3 };

describe('ChiaNè Auth & Foundation API (Module 01)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let otpProvider: CaptureOtpProvider;

  beforeAll(async () => {
    prisma = await testDb.initPrisma();
  });

  beforeEach(async () => {
    await resetDb(prisma);

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
    await testDb.cleanupDb(prisma);
  });

  it('uses a hashed, single-use challenge only for the configured production reviewer', async () => {
    const config = loadConfig({
      NODE_ENV: 'production', DATABASE_URL: baseConfig.DATABASE_URL, JWT_ACCESS_SECRET: baseConfig.JWT_ACCESS_SECRET,
      OTP_DEV_ECHO: 'false', REVIEWER_DEMO_PHONE: '0912 345 678', REVIEWER_DEMO_OTP: '012345',
    });
    await app.close();
    app = await buildApp({ config, prisma, otpProvider });
    const request = (phone: string) => app.inject({ method: 'POST', url: '/api/v1/auth/otp/request', payload: { phone } });
    const verify = (phone: string, code: string) => app.inject({ method: 'POST', url: '/api/v1/auth/otp/verify', payload: { phone, code } });
    const reviewer = '+84912345678';
    const ordinary = '0987654321';
    const issued = await request(reviewer);
    expect(issued.statusCode).toBe(200);
    expect(issued.json()).not.toHaveProperty('devOtp');
    expect(otpProvider.lastSent).toBeNull();
    const challenge = await prisma.otpChallenge.findFirstOrThrow({ where: { phone: reviewer } });
    expect(challenge.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await verify(reviewer, '000000')).json().error.code).toBe('OTP_INVALID');
    expect((await verify(reviewer, '012345')).json().accessToken).toBeTruthy();
    expect((await verify(reviewer, '012345')).statusCode).toBe(401);
    expect((await request(ordinary)).statusCode).toBe(200);
    expect(otpProvider.lastSent?.phone).toBe('+84987654321');
    expect((await verify(ordinary, '012345')).json().error.code).toBe('OTP_INVALID');
    expect((await verify(ordinary, otpProvider.lastSent!.code)).statusCode).toBe(200);
  });

  it.each([{ REVIEWER_DEMO_PHONE: '+84912345678' }, { REVIEWER_DEMO_OTP: '012345' }])(
    'delivers ordinary OTPs with incomplete review configuration %o', async partial => {
      await app.close();
      app = await buildApp({ config: { ...baseConfig, ...partial }, prisma, otpProvider });
      const res = await app.inject({ method: 'POST', url: '/api/v1/auth/otp/request', payload: { phone: '0912345678' } });
      expect(res.statusCode).toBe(200);
      expect(otpProvider.lastSent?.code).toBe(res.json().devOtp);
    }
  );

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

  it('serves public Vietnamese HTML legal pages for Google Play compliance (/legal/privacy, /legal/terms, /legal/delete-account)', async () => {
    const routes: Array<{ url: string; expectedText: string }> = [
      { url: '/legal/privacy', expectedText: 'Chính sách quyền riêng tư' },
      { url: '/legal/terms', expectedText: 'Điều khoản sử dụng' },
      { url: '/legal/delete-account', expectedText: 'Hướng dẫn xóa tài khoản' },
    ];

    for (const route of routes) {
      const res = await app.inject({ method: 'GET', url: route.url });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain(route.expectedText);
    }

    const defaultDeleteRes = await app.inject({ method: 'GET', url: '/legal/delete-account' });
    expect(defaultDeleteRes.body).toContain('mailto:support@chiane.app');

    const customEmailApp = await buildApp({
      config: { ...baseConfig, SUPPORT_EMAIL: 'hotro.chiane@gmail.com' },
      prisma,
      otpProvider,
    });
    try {
      const privacyRes = await customEmailApp.inject({ method: 'GET', url: '/legal/privacy' });
      const deleteRes = await customEmailApp.inject({ method: 'GET', url: '/legal/delete-account' });
      expect(privacyRes.statusCode).toBe(200);
      expect(privacyRes.body).toContain('mailto:hotro.chiane@gmail.com');
      expect(deleteRes.statusCode).toBe(200);
      expect(deleteRes.body).toContain('mailto:hotro.chiane@gmail.com');
    } finally {
      await customEmailApp.close();
    }
  });

  it('blocks account deletion while active group balance is unsettled, then deletes account, promotes next admin, revokes tokens, and preserves group expense history once settled', async () => {
    const testApp = await buildApp({
      config: { ...baseConfig, OTP_RESEND_COOLDOWN_SECONDS: 0 },
      prisma,
      otpProvider,
    });

    try {
      const userA = await createAuthedUser(testApp, otpProvider, '0912345678', 'An');
      const userB = await createAuthedUser(testApp, otpProvider, '0987654321', 'Bình');

      const groupRes = await testApp.inject({
        method: 'POST',
        url: '/api/v1/groups',
        headers: userA.authHeader,
        payload: { name: 'Đà Lạt 2026', category: 'TRAVEL' },
      });
      expect(groupRes.statusCode).toBe(201);
      const group = groupRes.json().group;

      const joinRes = await testApp.inject({
        method: 'POST',
        url: `/api/v1/invites/${group.inviteCode}/join`,
        headers: userB.authHeader,
        payload: {},
      });
      expect(joinRes.statusCode).toBe(201);
      const binhMemberId = joinRes.json().memberId as string;

      const expenseRes = await testApp.inject({
        method: 'POST',
        url: `/api/v1/groups/${group.id}/expenses`,
        headers: userA.authHeader,
        payload: {
          title: 'Lẩu gà lá é',
          amountVnd: 100000,
          category: 'FOOD',
          splitMethod: 'EQUAL',
          paidByMemberId: group.myMemberId,
          splits: [{ memberId: group.myMemberId }, { memberId: binhMemberId }],
        },
      });
      expect(expenseRes.statusCode).toBe(201);

      // Blocked while An has +50,000 VND unsettled balance in an active group
      const blockedRes = await testApp.inject({
        method: 'DELETE',
        url: '/api/v1/auth/me',
        headers: userA.authHeader,
      });
      expect(blockedRes.statusCode).toBe(400);
      expect(blockedRes.json().error.code).toBe('UNSETTLED_ACCOUNT_CANNOT_DELETE');
      expect(blockedRes.json().error.message).toContain('Đà Lạt 2026');

      // Bình pays back 50,000 VND and An confirms
      const reportRes = await testApp.inject({
        method: 'POST',
        url: `/api/v1/groups/${group.id}/settlements/report`,
        headers: userB.authHeader,
        payload: {
          fromMemberId: binhMemberId,
          toMemberId: group.myMemberId,
          amountVnd: 50000,
          method: 'CASH',
        },
      });
      expect(reportRes.statusCode).toBe(201);
      const settlementId = reportRes.json().settlement.id as string;

      const confirmRes = await testApp.inject({
        method: 'POST',
        url: `/api/v1/settlements/${settlementId}/confirm`,
        headers: userA.authHeader,
      });
      expect(confirmRes.statusCode).toBe(200);

      // Now all balances are 0 -> An can delete her account
      const deleteRes = await testApp.inject({
        method: 'DELETE',
        url: '/api/v1/auth/me',
        headers: userA.authHeader,
      });
      expect(deleteRes.statusCode).toBe(200);
      expect(deleteRes.json().success).toBe(true);

      // Refresh token revoked & /me rejects deleted account
      const refreshAfter = await testApp.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: userA.refreshToken },
      });
      expect(refreshAfter.statusCode).toBe(401);

      const meAfter = await testApp.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: userA.authHeader,
      });
      expect(meAfter.statusCode).toBe(404);

      // Group history intact and Bình was promoted to ADMIN
      const groupAfter = await testApp.inject({
        method: 'GET',
        url: `/api/v1/groups/${group.id}`,
        headers: userB.authHeader,
      });
      expect(groupAfter.statusCode).toBe(200);
      const groupData = groupAfter.json().group;
      expect(groupData.myRole).toBe('ADMIN');
      expect(groupData.expenses).toHaveLength(1);
      expect(groupData.expenses[0].amountVnd).toBe(100000);
    } finally {
      await testApp.close();
    }
  });
});
