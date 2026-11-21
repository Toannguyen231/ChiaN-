import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { hashGuestToken } from '../services/balance.service';
import {
  CaptureOtpProvider,
  createAuthedUser,
  createTestDb,
  resetDb,
} from './test-helpers';

const testDb = createTestDb('expenses');

describe('ChiaNè Expense Management & Splitting API (Module 03)', () => {
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

  it('handles equal split VND rounding (1,000,000 / 3), exact split validation, percentage split & idempotency', async () => {
    const an = await createAuthedUser(app, otpProvider, '0912345678', 'An');
    const linh = await createAuthedUser(app, otpProvider, '0987654321', 'Linh');
    const minh = await createAuthedUser(app, otpProvider, '0901112233', 'Minh');

    const groupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/groups',
      headers: an.authHeader,
      payload: { name: 'Đà Lạt cuối tuần', category: 'TRAVEL' },
    });
    const group = groupRes.json().group;
    const anMemberId = group.myMemberId;

    const linhJoin = await app.inject({
      method: 'POST',
      url: `/api/v1/invites/${group.inviteCode}/join`,
      headers: linh.authHeader,
    });
    const linhMemberId = linhJoin.json().memberId;

    const minhJoin = await app.inject({
      method: 'POST',
      url: `/api/v1/invites/${group.inviteCode}/join`,
      headers: minh.authHeader,
    });
    const minhMemberId = minhJoin.json().memberId;

    // 1. Equal split 1,000,000 VND across 3 people -> 333,334 + 333,333 + 333,333
    const equalRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/expenses`,
      headers: an.authHeader,
      payload: {
        title: 'Bữa tối',
        amountVnd: 1000000,
        category: 'FOOD',
        splitMethod: 'EQUAL',
        paidByMemberId: minhMemberId,
        clientMutationId: 'mut-equal-1000000',
        splits: [
          { memberId: anMemberId },
          { memberId: linhMemberId },
          { memberId: minhMemberId },
        ],
      },
    });
    expect(equalRes.statusCode).toBe(201);
    const createdExpense = equalRes.json().expense;
    const amounts = createdExpense.splits.map((s: { amountVnd: number }) => s.amountVnd);
    expect(amounts).toEqual([333334, 333333, 333333]);
    expect(amounts.reduce((a: number, b: number) => a + b, 0)).toBe(1000000);

    // Idempotent replay returns 200 with same expense ID
    const replayRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/expenses`,
      headers: an.authHeader,
      payload: {
        title: 'Bữa tối',
        amountVnd: 1000000,
        category: 'FOOD',
        splitMethod: 'EQUAL',
        paidByMemberId: minhMemberId,
        clientMutationId: 'mut-equal-1000000',
        splits: [
          { memberId: anMemberId },
          { memberId: linhMemberId },
          { memberId: minhMemberId },
        ],
      },
    });
    expect(replayRes.statusCode).toBe(200);
    expect(replayRes.json().expense.id).toBe(createdExpense.id);

    // 2. Exact split mismatch blocked with 400 SPLIT_MISMATCH
    const mismatchRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/expenses`,
      headers: an.authHeader,
      payload: {
        title: 'Taxi',
        amountVnd: 400000,
        category: 'TRANSPORT',
        splitMethod: 'EXACT',
        paidByMemberId: anMemberId,
        splits: [
          { memberId: anMemberId, amountVnd: 200000 },
          { memberId: linhMemberId, amountVnd: 150000 },
        ],
      },
    });
    expect(mismatchRes.statusCode).toBe(400);
    expect(mismatchRes.json().error.code).toBe('SPLIT_MISMATCH');

    // 3. Percentage split computes exact integer VND
    const pctRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/expenses`,
      headers: linh.authHeader,
      payload: {
        title: 'Cà phê sáng',
        amountVnd: 200000,
        category: 'COFFEE',
        splitMethod: 'PERCENTAGE',
        paidByMemberId: linhMemberId,
        splits: [
          { memberId: anMemberId, percentageBps: 5000 },
          { memberId: linhMemberId, percentageBps: 3000 },
          { memberId: minhMemberId, percentageBps: 2000 },
        ],
      },
    });
    expect(pctRes.statusCode).toBe(201);
    const pctSplits = pctRes.json().expense.splits;
    expect(pctSplits[0].amountVnd).toBe(100000);
    expect(pctSplits[1].amountVnd).toBe(60000);
    expect(pctSplits[2].amountVnd).toBe(40000);
  });

  it('edits and soft-deletes expenses and enforces guest & non-member RBAC', async () => {
    const an = await createAuthedUser(app, otpProvider, '0912345678', 'An');
    const stranger = await createAuthedUser(app, otpProvider, '0909998877', 'Stranger');

    const groupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/groups',
      headers: an.authHeader,
      payload: { name: 'Nhà mình', category: 'HOUSEHOLD' },
    });
    const group = groupRes.json().group;
    const anMemberId = group.myMemberId;

    // Create a guest member directly in DB to verify guest RBAC
    const rawGuestToken = crypto.randomBytes(24).toString('hex');
    const guest = await prisma.groupMember.create({
      data: {
        groupId: group.id,
        userId: null,
        guestTokenHash: hashGuestToken(rawGuestToken),
        displayName: 'Huy (Khách)',
        role: 'GUEST',
        status: 'ACTIVE',
      },
    });

    // An creates an expense
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/expenses`,
      headers: an.authHeader,
      payload: {
        title: 'Tiền điện',
        amountVnd: 500000,
        category: 'OTHER',
        splitMethod: 'EQUAL',
        paidByMemberId: anMemberId,
        splits: [{ memberId: anMemberId }, { memberId: guest.id }],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const expenseId = createRes.json().expense.id;

    // Non-member cannot read or edit expense
    const strangerRead = await app.inject({
      method: 'GET',
      url: `/api/v1/expenses/${expenseId}`,
      headers: stranger.authHeader,
    });
    expect(strangerRead.statusCode).toBe(403);

    // Guest cannot edit An's expense
    const guestEditOther = await app.inject({
      method: 'PATCH',
      url: `/api/v1/expenses/${expenseId}`,
      headers: { 'x-guest-token': rawGuestToken },
      payload: { title: 'Sửa trái phép' },
    });
    expect(guestEditOther.statusCode).toBe(403);

    // An edits expense amount to 600,000 VND
    const editRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/expenses/${expenseId}`,
      headers: an.authHeader,
      payload: {
        amountVnd: 600000,
        note: 'Tháng 11',
      },
    });
    expect(editRes.statusCode).toBe(200);
    expect(editRes.json().expense.amountVnd).toBe(600000);
    expect(editRes.json().expense.splits.map((s: { amountVnd: number }) => s.amountVnd)).toEqual([
      300000, 300000,
    ]);

    // An soft-deletes expense -> balance returns to 0
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/expenses/${expenseId}`,
      headers: an.authHeader,
    });
    expect(deleteRes.statusCode).toBe(200);

    const detailAfter = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${group.id}`,
      headers: an.authHeader,
    });
    expect(detailAfter.json().group.totalSpentVnd).toBe(0);
    expect(detailAfter.json().group.myBalanceVnd).toBe(0);
  });
});
