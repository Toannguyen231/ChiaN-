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

const testDb = createTestDb('pot');

describe('ChiaNè Group Pot (Quỹ chung nhóm / Heo đất) API', () => {
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

  it('tracks multi-member pot contributions, deducts pot-paid expenses without personal debt, and computes exact refunds', async () => {
    const an = await createAuthedUser(app, otpProvider, '0912345678', 'An');
    const binh = await createAuthedUser(app, otpProvider, '0987654321', 'Bình');

    const groupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/groups',
      headers: an.authHeader,
      payload: { name: 'Phượt Phú Quốc', category: 'TRAVEL' },
    });
    expect(groupRes.statusCode).toBe(201);
    const group = groupRes.json().group;

    const joinRes = await app.inject({
      method: 'POST',
      url: `/api/v1/invites/${group.inviteCode}/join`,
      headers: binh.authHeader,
      payload: {},
    });
    expect(joinRes.statusCode).toBe(201);
    const binhMemberId = joinRes.json().memberId;

    // 1. An and Bình each contribute 500,000 VND into the Group Pot
    const c1 = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/pot/contribute`,
      headers: an.authHeader,
      payload: { memberId: group.myMemberId, amountVnd: 500_000, note: 'Góp quỹ đợt 1' },
    });
    expect(c1.statusCode).toBe(201);

    const c2 = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/pot/contribute`,
      headers: binh.authHeader,
      payload: { amountVnd: 500_000 },
    });
    expect(c2.statusCode).toBe(201);

    // 2. Read pot summary
    const potGet1 = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${group.id}/pot`,
      headers: an.authHeader,
    });
    expect(potGet1.statusCode).toBe(200);
    expect(potGet1.json().totalContributedVnd).toBe(1_000_000);
    expect(potGet1.json().totalSpentFromPotVnd).toBe(0);
    expect(potGet1.json().remainingPotVnd).toBe(1_000_000);
    expect(potGet1.json().contributions.length).toBe(2);

    // 3. Record an expense of 350,000 VND paid from the Group Pot (split equally between An & Bình)
    const potExpRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/expenses`,
      headers: an.authHeader,
      payload: {
        title: 'Tiền xăng & vé phà',
        amountVnd: 350_000,
        category: 'TRANSPORT',
        splitMethod: 'EQUAL',
        paidByMemberId: group.myMemberId,
        isPaidFromPot: true,
        splits: [{ memberId: group.myMemberId }, { memberId: binhMemberId }],
      },
    });
    expect(potExpRes.statusCode).toBe(201);
    expect(potExpRes.json().expense.isPaidFromPot).toBe(true);

    // 4. Personal balances remain 0 because the expense came from the Group Pot
    const balRes = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${group.id}/balances`,
      headers: an.authHeader,
    });
    expect(balRes.statusCode).toBe(200);
    expect(balRes.json().suggestedTransfers).toEqual([]);
    for (const mBal of balRes.json().memberBalances) {
      expect(mBal.netBalanceVnd).toBe(0);
    }

    // 5. Pot summary deducts 350k and computes per-member refund (325k each)
    const potGet2 = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${group.id}/pot`,
      headers: an.authHeader,
    });
    expect(potGet2.statusCode).toBe(200);
    const potData = potGet2.json();
    expect(potData.totalContributedVnd).toBe(1_000_000);
    expect(potData.totalSpentFromPotVnd).toBe(350_000);
    expect(potData.remainingPotVnd).toBe(650_000);
    const refundSum = potData.memberSummaries.reduce(
      (sum: number, s: { netRefundVnd: number }) => sum + s.netRefundVnd,
      0
    );
    expect(refundSum).toBe(potData.remainingPotVnd);
  });

  it('rejects pot contributions on archived groups and forbids guests from contributing for others', async () => {
    const an = await createAuthedUser(app, otpProvider, '0912345678', 'An');
    const groupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/groups',
      headers: an.authHeader,
      payload: { name: 'Team Building', category: 'OTHER' },
    });
    const group = groupRes.json().group;

    const guestRes = await app.inject({
      method: 'POST',
      url: `/api/v1/invites/${group.inviteCode}/join-guest`,
      payload: { displayName: 'Khách Huy' },
    });
    expect(guestRes.statusCode).toBe(201);
    const guest = guestRes.json();

    // Guest trying to log contribution for An -> 403
    const forbiddenRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/pot/contribute`,
      headers: { 'x-guest-token': guest.guestToken },
      payload: { memberId: group.myMemberId, amountVnd: 200_000 },
    });
    expect(forbiddenRes.statusCode).toBe(403);

    // Guest logging contribution for self -> 201
    const guestSelfRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/pot/contribute`,
      headers: { 'x-guest-token': guest.guestToken },
      payload: { amountVnd: 200_000 },
    });
    expect(guestSelfRes.statusCode).toBe(201);

    // Archive group -> blocks new pot contribution with 400 GROUP_ARCHIVED
    const archiveRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/archive`,
      headers: an.authHeader,
      payload: { archived: true },
    });
    expect(archiveRes.statusCode).toBe(200);

    const archivedPotRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/pot/contribute`,
      headers: an.authHeader,
      payload: { amountVnd: 100_000 },
    });
    expect(archivedPotRes.statusCode).toBe(400);
    expect(archivedPotRes.json().error.code).toBe('GROUP_ARCHIVED');
  });
});
