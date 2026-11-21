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

const testDb = createTestDb('activity');

describe('ChiaNè Activity Feed & Friendly Reminders API (Module 05)', () => {
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
      config: { ...testDb.config },
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

  it('filters activity feed across groups with member isolation & enforces 24h reminder rate limit', async () => {
    const an = await createAuthedUser(app, otpProvider, '0912345678', 'An');
    const huy = await createAuthedUser(app, otpProvider, '0987654321', 'Huy');
    const outsider = await createAuthedUser(app, otpProvider, '0901112233', 'Outsider');

    const gRes = await app.inject({
      method: 'POST',
      url: '/api/v1/groups',
      headers: an.authHeader,
      payload: { name: 'Đà Lạt cuối tuần', category: 'TRAVEL' },
    });
    const group = gRes.json().group;
    const anMemberId = group.myMemberId;
    const huyMemberId = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/invites/${group.inviteCode}/join`,
        headers: huy.authHeader,
      })
    ).json().memberId;

    // Create expense + report settlement
    await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/expenses`,
      headers: an.authHeader,
      payload: {
        title: 'Taxi đi chung',
        amountVnd: 320000,
        category: 'TRANSPORT',
        splitMethod: 'EQUAL',
        paidByMemberId: anMemberId,
        splits: [{ memberId: anMemberId }, { memberId: huyMemberId }],
      },
    });

    await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/settlements/report`,
      headers: huy.authHeader,
      payload: {
        fromMemberId: huyMemberId,
        toMemberId: anMemberId,
        amountVnd: 160000,
        method: 'BANK_TRANSFER',
      },
    });

    // Send first friendly reminder (succeeds 201)
    const firstReminder = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/reminders`,
      headers: an.authHeader,
      payload: {
        recipientMemberId: huyMemberId,
        amountVnd: 160000,
        message: 'Huy ơi phần Đà Lạt còn 160k nha!',
      },
    });
    expect(firstReminder.statusCode).toBe(201);
    expect(firstReminder.json().reminder.recipientName).toBe('Huy');

    // Second reminder within 24h returns 429 REMINDER_RATE_LIMITED
    const secondReminder = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/reminders`,
      headers: an.authHeader,
      payload: {
        recipientMemberId: huyMemberId,
        amountVnd: 160000,
        message: 'Nhắc lần 2 nè',
      },
    });
    expect(secondReminder.statusCode).toBe(429);
    expect(secondReminder.json().error.code).toBe('REMINDER_RATE_LIMITED');
    expect(secondReminder.json().error.details.nextAllowedAt).toBeTruthy();

    // Activity feed filters cleanly
    const allFeed = await app.inject({
      method: 'GET',
      url: '/api/v1/activity?filter=ALL',
      headers: an.authHeader,
    });
    expect(allFeed.statusCode).toBe(200);
    expect(allFeed.json().activities.length).toBeGreaterThanOrEqual(5);

    const expFeed = await app.inject({
      method: 'GET',
      url: '/api/v1/activity?filter=EXPENSE',
      headers: an.authHeader,
    });
    expect(
      expFeed
        .json()
        .activities.every((a: { type: string }) => a.type.startsWith('EXPENSE_'))
    ).toBe(true);

    const payFeed = await app.inject({
      method: 'GET',
      url: '/api/v1/activity?filter=PAYMENT',
      headers: an.authHeader,
    });
    expect(
      payFeed
        .json()
        .activities.every(
          (a: { type: string }) =>
            a.type.startsWith('SETTLEMENT_') || a.type === 'REMINDER_SENT'
        )
    ).toBe(true);

    // Outsider never sees private group activities
    const outsiderFeed = await app.inject({
      method: 'GET',
      url: '/api/v1/activity',
      headers: outsider.authHeader,
    });
    expect(outsiderFeed.statusCode).toBe(200);
    expect(outsiderFeed.json().activities).toHaveLength(0);

    const outsiderGroupFilter = await app.inject({
      method: 'GET',
      url: `/api/v1/activity?groupId=${group.id}`,
      headers: outsider.authHeader,
    });
    expect(outsiderGroupFilter.statusCode).toBe(403);
  });
});
