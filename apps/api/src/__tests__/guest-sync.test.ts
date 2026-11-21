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

const testDb = createTestDb('guest-sync');

describe('ChiaNè Guest Mode, Phone Recovery & Offline Sync API (Module 06)', () => {
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

  it('supports public invite preview, multiple guests joining, guest RBAC & claim-guest upgrade', async () => {
    const an = await createAuthedUser(app, otpProvider, '0912345678', 'An');
    const groupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/groups',
      headers: an.authHeader,
      payload: { name: 'Đà Lạt cuối tuần', category: 'TRAVEL' },
    });
    const group = groupRes.json().group;

    // An adds a private expense
    await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/expenses`,
      headers: an.authHeader,
      payload: {
        title: 'Chi tiêu bí mật',
        amountVnd: 100000,
        category: 'FOOD',
        splitMethod: 'EQUAL',
        paidByMemberId: group.myMemberId,
        splits: [{ memberId: group.myMemberId }],
      },
    });

    // Public invite preview only exposes non-sensitive summary
    const previewRes = await app.inject({
      method: 'GET',
      url: `/api/v1/invites/${group.inviteCode}`,
    });
    expect(previewRes.statusCode).toBe(200);
    const preview = previewRes.json();
    expect(preview.name).toBe('Đà Lạt cuối tuần');
    expect(preview.inviterName).toBe('An');
    expect(preview.expenses).toBeUndefined();

    // Two guests join same group (confirms SQLite composite unique allows multiple NULL userId rows)
    const guest1Res = await app.inject({
      method: 'POST',
      url: `/api/v1/invites/${group.inviteCode}/join-guest`,
      payload: { displayName: 'Huy' },
    });
    expect(guest1Res.statusCode).toBe(201);
    const guest1 = guest1Res.json();
    expect(guest1.role).toBe('GUEST');

    const guest2Res = await app.inject({
      method: 'POST',
      url: `/api/v1/invites/${group.inviteCode}/join-guest`,
      payload: { displayName: 'Khánh' },
    });
    expect(guest2Res.statusCode).toBe(201);

    const guestHeaders = { 'x-guest-token': guest1.guestToken };

    // Guest can read group, add expense, read balances, report own settlement
    const gView = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${group.id}`,
      headers: guestHeaders,
    });
    expect(gView.statusCode).toBe(200);

    const guestExp = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/expenses`,
      headers: guestHeaders,
      payload: {
        title: 'Trà sữa',
        amountVnd: 80000,
        category: 'COFFEE',
        splitMethod: 'EQUAL',
        paidByMemberId: guest1.memberId,
        splits: [{ memberId: guest1.memberId }, { memberId: group.myMemberId }],
      },
    });
    expect(guestExp.statusCode).toBe(201);

    // Guest gets 403 on admin/member-only endpoints
    const guestRename = await app.inject({
      method: 'PATCH',
      url: `/api/v1/groups/${group.id}`,
      headers: guestHeaders,
      payload: { name: 'Hack' },
    });
    expect(guestRename.statusCode).toBe(403);

    const guestLeave = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/leave`,
      headers: guestHeaders,
    });
    expect(guestLeave.statusCode).toBe(403);

    const guestRemind = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/reminders`,
      headers: guestHeaders,
      payload: {
        recipientMemberId: group.myMemberId,
        amountVnd: 40000,
        message: 'Nhắc',
      },
    });
    expect(guestRemind.statusCode).toBe(403);

    // Huy registers via OTP and claims his guest membership -> upgraded to MEMBER
    const huyUser = await createAuthedUser(app, otpProvider, '0933445566', 'Huy Chính Thức');
    const claimRes = await app.inject({
      method: 'POST',
      url: '/api/v1/invites/claim-guest',
      headers: huyUser.authHeader,
      payload: { guestToken: guest1.guestToken },
    });
    expect(claimRes.statusCode).toBe(200);
    expect(claimRes.json().memberId).toBe(guest1.memberId);

    const afterClaim = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${group.id}`,
      headers: huyUser.authHeader,
    });
    expect(afterClaim.statusCode).toBe(200);
    expect(afterClaim.json().group.myRole).toBe('MEMBER');

    // Old guest token is now invalidated
    const oldGuestAttempt = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${group.id}`,
      headers: guestHeaders,
    });
    expect(oldGuestAttempt.statusCode).toBe(401);
  });

  it('replays /api/v1/sync/mutations idempotently and supports authenticated phone change', async () => {
    const an = await createAuthedUser(app, otpProvider, '0912345678', 'An');
    const other = await createAuthedUser(app, otpProvider, '0987654321', 'Linh');

    const gRes = await app.inject({
      method: 'POST',
      url: '/api/v1/groups',
      headers: an.authHeader,
      payload: { name: 'Nhà mình', category: 'HOUSEHOLD' },
    });
    const group = gRes.json().group;

    const mutationItem = {
      clientMutationId: 'offline_mut_0001',
      type: 'CREATE_EXPENSE' as const,
      groupId: group.id,
      payload: {
        title: 'Nước uống',
        amountVnd: 150000,
        category: 'FOOD' as const,
        splitMethod: 'EQUAL' as const,
        paidByMemberId: group.myMemberId,
        splits: [{ memberId: group.myMemberId }],
      },
    };

    const sync1 = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/mutations',
      headers: an.authHeader,
      payload: { mutations: [mutationItem] },
    });
    expect(sync1.statusCode).toBe(200);
    expect(sync1.json().results[0].status).toBe('SYNCED');

    const sync2 = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/mutations',
      headers: an.authHeader,
      payload: { mutations: [mutationItem] },
    });
    expect(sync2.statusCode).toBe(200);
    expect(sync2.json().results[0].status).toBe('ALREADY_SYNCED');
    expect(sync2.json().results[0].expenseId).toBe(sync1.json().results[0].expenseId);

    const groupDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${group.id}`,
      headers: an.authHeader,
    });
    expect(groupDetail.json().group.totalSpentVnd).toBe(150000);

    // Phone change: rejects phone already in use (409)
    const dupPhoneRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone/request',
      headers: an.authHeader,
      payload: { phone: other.user.phone },
    });
    expect(dupPhoneRes.statusCode).toBe(409);

    // Valid new phone OTP change revokes old refresh token & issues new session
    const changeReq = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone/request',
      headers: an.authHeader,
      payload: { phone: '0909888777' },
    });
    expect(changeReq.statusCode).toBe(200);
    const otpCode = otpProvider.byPhone.get('+84909888777')!;

    const changeVerify = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone/verify',
      headers: an.authHeader,
      payload: { phone: '0909888777', code: otpCode },
    });
    expect(changeVerify.statusCode).toBe(200);
    expect(changeVerify.json().user.phone).toBe('+84909888777');

    // Old refresh token was revoked during phone change
    const oldRefreshTry = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: an.refreshToken },
    });
    expect(oldRefreshTry.statusCode).toBe(401);
  });
});
