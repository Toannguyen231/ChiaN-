import { buildVietQrPayload, computeCrc16Ccitt } from '@chiane/shared';
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

const testDb = createTestDb('e2e');

describe('ChiaNè Cross-Module End-to-End Flow (Phase 7)', () => {
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

  it('executes complete user journey from OTP onboarding, guest RBAC, VND splits, VietQR settlement, reminders & offline sync to claim-guest', async () => {
    // 1. Register Minh (Admin) & An (Member), configure Minh bank info
    const minh = await createAuthedUser(app, otpProvider, '0912345678', 'Minh');
    const an = await createAuthedUser(app, otpProvider, '0987654321', 'An');

    const bankRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: minh.authHeader,
      payload: {
        bankBin: '970436',
        bankName: 'Vietcombank',
        bankAccountNumber: '0123456789',
        bankAccountHolder: 'NGUYEN MINH',
      },
    });
    expect(bankRes.statusCode).toBe(200);
    expect(bankRes.json().user.bankBin).toBe('970436');

    // 2. Minh creates a group and verifies public invite preview
    const groupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/groups',
      headers: minh.authHeader,
      payload: { name: 'Đà Lạt 2026', category: 'TRAVEL' },
    });
    expect(groupRes.statusCode).toBe(201);
    const group = groupRes.json().group;
    const minhMemberId = group.myMemberId as string;

    const previewRes = await app.inject({
      method: 'GET',
      url: `/api/v1/invites/${group.inviteCode}`,
    });
    expect(previewRes.statusCode).toBe(200);
    expect(previewRes.json().name).toBe('Đà Lạt 2026');
    expect(previewRes.json().inviterName).toBe('Minh');

    // 3. An joins via authenticated invite; Lan joins as Guest
    const anJoinRes = await app.inject({
      method: 'POST',
      url: `/api/v1/invites/${group.inviteCode}/join`,
      headers: an.authHeader,
    });
    expect(anJoinRes.statusCode).toBe(201);
    const anMemberId = anJoinRes.json().memberId as string;

    const guestJoinRes = await app.inject({
      method: 'POST',
      url: `/api/v1/invites/${group.inviteCode}/join-guest`,
      payload: { displayName: 'Khách Lan' },
    });
    expect(guestJoinRes.statusCode).toBe(201);
    const guestSession = guestJoinRes.json();
    const lanMemberId = guestSession.memberId as string;
    const guestHeaders = { 'x-guest-token': guestSession.guestToken as string };

    // 4. Verify Guest RBAC restrictions (403 on admin/member-only writes, 200 on read)
    const guestPatchGroup = await app.inject({
      method: 'PATCH',
      url: `/api/v1/groups/${group.id}`,
      headers: guestHeaders,
      payload: { name: 'Đổi tên trái phép' },
    });
    expect(guestPatchGroup.statusCode).toBe(403);
    expect(guestPatchGroup.json().error.code).toBe('INSUFFICIENT_ROLE');

    const guestArchive = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/archive`,
      headers: guestHeaders,
      payload: { archived: true },
    });
    expect(guestArchive.statusCode).toBe(403);
    expect(guestArchive.json().error.code).toBe('INSUFFICIENT_ROLE');

    const guestRemind = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/reminders`,
      headers: guestHeaders,
      payload: {
        recipientMemberId: anMemberId,
        amountVnd: 100000,
        message: 'Nhắc thử',
      },
    });
    expect(guestRemind.statusCode).toBe(403);
    expect(guestRemind.json().error.code).toBe('INSUFFICIENT_ROLE');

    const guestReadGroup = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${group.id}`,
      headers: guestHeaders,
    });
    expect(guestReadGroup.statusCode).toBe(200);
    expect(guestReadGroup.json().group.myRole).toBe('GUEST');

    // 5. Expense & split rules: EQUAL 1,000,000/3, invalid EXACT 400, valid EXACT + edit + soft-delete -> 404
    const equalRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/expenses`,
      headers: minh.authHeader,
      payload: {
        title: 'Lẩu gà lá é',
        amountVnd: 1000000,
        category: 'FOOD',
        splitMethod: 'EQUAL',
        paidByMemberId: minhMemberId,
        splits: [
          { memberId: minhMemberId },
          { memberId: anMemberId },
          { memberId: lanMemberId },
        ],
      },
    });
    expect(equalRes.statusCode).toBe(201);
    const equalSplits = equalRes
      .json()
      .expense.splits.map((s: { amountVnd: number }) => s.amountVnd)
      .sort((a: number, b: number) => a - b);
    expect(equalSplits).toEqual([333333, 333333, 333334]);
    expect(equalSplits.reduce((sum: number, n: number) => sum + n, 0)).toBe(1000000);

    const invalidExactRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/expenses`,
      headers: minh.authHeader,
      payload: {
        title: 'Vé cáp treo lỗi',
        amountVnd: 300000,
        category: 'OTHER',
        splitMethod: 'EXACT',
        paidByMemberId: minhMemberId,
        splits: [
          { memberId: minhMemberId, amountVnd: 100000 },
          { memberId: anMemberId, amountVnd: 150000 },
        ],
      },
    });
    expect(invalidExactRes.statusCode).toBe(400);

    // Guest Lan creates a valid EXACT expense, edits it, then soft-deletes it
    const guestExpenseRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/expenses`,
      headers: guestHeaders,
      payload: {
        title: 'Bánh tráng nướng',
        amountVnd: 300000,
        category: 'FOOD',
        splitMethod: 'EXACT',
        paidByMemberId: lanMemberId,
        splits: [
          { memberId: minhMemberId, amountVnd: 100000 },
          { memberId: anMemberId, amountVnd: 100000 },
          { memberId: lanMemberId, amountVnd: 100000 },
        ],
      },
    });
    expect(guestExpenseRes.statusCode).toBe(201);
    const tempExpenseId = guestExpenseRes.json().expense.id as string;

    const editRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/expenses/${tempExpenseId}`,
      headers: guestHeaders,
      payload: {
        title: 'Bánh tráng nướng đêm',
      },
    });
    expect(editRes.statusCode).toBe(200);
    expect(editRes.json().expense.title).toBe('Bánh tráng nướng đêm');

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/expenses/${tempExpenseId}`,
      headers: guestHeaders,
    });
    expect(deleteRes.statusCode).toBe(200);

    const afterDeleteRes = await app.inject({
      method: 'GET',
      url: `/api/v1/expenses/${tempExpenseId}`,
      headers: minh.authHeader,
    });
    expect(afterDeleteRes.statusCode).toBe(404);

    // 6. Balances, VietQR & Dashboard zero-sum verification
    const balancesRes = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${group.id}/balances`,
      headers: an.authHeader,
    });
    expect(balancesRes.statusCode).toBe(200);
    const balances = balancesRes.json();

    const zeroSum = balances.memberBalances.reduce(
      (sum: number, m: { netBalanceVnd: number }) => sum + m.netBalanceVnd,
      0
    );
    expect(zeroSum).toBe(0);
    expect(balances.suggestedTransfers).toHaveLength(2);

    const minhBalanceRow = balances.memberBalances.find(
      (m: { memberId: string }) => m.memberId === minhMemberId
    );
    expect(minhBalanceRow.netBalanceVnd).toBe(666666);
    expect(minhBalanceRow.bankPreview.hasRealBank).toBe(true);

    const anTransfer = balances.suggestedTransfers.find(
      (t: { fromMemberId: string }) => t.fromMemberId === anMemberId
    );
    expect(anTransfer.toMemberId).toBe(minhMemberId);
    expect(anTransfer.amountVnd).toBe(333333);
    expect(anTransfer.toBankPreview.hasRealBank).toBe(true);

    const expectedQr = buildVietQrPayload({
      bankBin: '970436',
      accountNumber: '0123456789',
      amountVnd: 333333,
      memo: 'An tra tien Da Lat',
    });
    expect(expectedQr).toBeTruthy();
    expect(expectedQr!.slice(-4)).toBe(computeCrc16Ccitt(expectedQr!.slice(0, -4)));

    const [minhDashRes, anDashRes] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/v1/dashboard', headers: minh.authHeader }),
      app.inject({ method: 'GET', url: '/api/v1/dashboard', headers: an.authHeader }),
    ]);
    expect(minhDashRes.statusCode).toBe(200);
    expect(minhDashRes.json().totalOwedToYouVnd).toBe(666666);
    expect(minhDashRes.json().totalYouOweVnd).toBe(0);

    expect(anDashRes.statusCode).toBe(200);
    expect(anDashRes.json().totalOwedToYouVnd).toBe(0);
    expect(anDashRes.json().totalYouOweVnd).toBe(333333);

    // 7. Settlement report (idempotent), balance freeze, payer self-confirm 403, recipient confirm & activity
    const reportPayload = {
      fromMemberId: anMemberId,
      toMemberId: minhMemberId,
      amountVnd: 333333,
      method: 'BANK_TRANSFER',
      memo: 'An tra tien Da Lat',
      idempotencyKey: 'e2e-stl-an-minh',
    };
    const reportRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/settlements/report`,
      headers: an.authHeader,
      payload: reportPayload,
    });
    expect(reportRes.statusCode).toBe(201);
    const settlement = reportRes.json().settlement;
    expect(settlement.status).toBe('REPORTED');
    expect(settlement.vietQrPayload).toBeTruthy();
    expect(settlement.vietQrPayload.slice(-4)).toBe(
      computeCrc16Ccitt(settlement.vietQrPayload.slice(0, -4))
    );

    const replaySettlementRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/settlements/report`,
      headers: an.authHeader,
      payload: reportPayload,
    });
    expect(replaySettlementRes.statusCode).toBe(200);
    expect(replaySettlementRes.json().settlement.id).toBe(settlement.id);

    const balancesWhileReported = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${group.id}/balances`,
      headers: an.authHeader,
    });
    expect(balancesWhileReported.json().myNetBalanceVnd).toBe(-333333);

    const selfConfirmRes = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${settlement.id}/confirm`,
      headers: an.authHeader,
    });
    expect(selfConfirmRes.statusCode).toBe(403);

    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${settlement.id}/confirm`,
      headers: minh.authHeader,
    });
    expect(confirmRes.statusCode).toBe(200);
    expect(confirmRes.json().settlement.status).toBe('CONFIRMED');

    const anAfterConfirm = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${group.id}/balances`,
      headers: an.authHeader,
    });
    expect(anAfterConfirm.json().myNetBalanceVnd).toBe(0);

    const activityRes = await app.inject({
      method: 'GET',
      url: '/api/v1/activity?filter=PAYMENT',
      headers: minh.authHeader,
    });
    expect(activityRes.statusCode).toBe(200);
    expect(
      activityRes.json().activities.some(
        (item: { type: string }) => item.type === 'SETTLEMENT_CONFIRMED'
      )
    ).toBe(true);

    // 8. Friendly reminder & 24h rate limit
    const remindRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/reminders`,
      headers: minh.authHeader,
      payload: {
        recipientMemberId: lanMemberId,
        amountVnd: 333333,
        message: 'Lan ơi lúc nào tiện thì chuyển khoản nhóm Đà Lạt nhé!',
      },
    });
    expect(remindRes.statusCode).toBe(201);

    const duplicateRemindRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/reminders`,
      headers: minh.authHeader,
      payload: {
        recipientMemberId: lanMemberId,
        amountVnd: 333333,
        message: 'Nhắc lại liền',
      },
    });
    expect(duplicateRemindRes.statusCode).toBe(429);
    expect(duplicateRemindRes.json().error.code).toBe('REMINDER_RATE_LIMITED');

    // 9. Offline sync batch with valid + failing item and idempotent replay
    const validMutation = {
      clientMutationId: 'e2e-sync-1',
      type: 'CREATE_EXPENSE' as const,
      groupId: group.id,
      payload: {
        title: 'Cà phê sáng offline',
        amountVnd: 300000,
        category: 'COFFEE' as const,
        splitMethod: 'EQUAL' as const,
        paidByMemberId: minhMemberId,
        splits: [
          { memberId: minhMemberId },
          { memberId: anMemberId },
          { memberId: lanMemberId },
        ],
      },
    };
    const invalidMutation = {
      clientMutationId: 'e2e-sync-bad',
      type: 'CREATE_EXPENSE' as const,
      groupId: group.id,
      payload: {
        title: 'Khoản lỗi offline',
        amountVnd: 150000,
        category: 'OTHER' as const,
        splitMethod: 'EXACT' as const,
        paidByMemberId: minhMemberId,
        splits: [{ memberId: minhMemberId, amountVnd: 50000 }],
      },
    };

    const syncBatchRes = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/mutations',
      headers: minh.authHeader,
      payload: { mutations: [validMutation, invalidMutation] },
    });
    expect(syncBatchRes.statusCode).toBe(200);
    const syncResults = syncBatchRes.json().results;
    expect(syncResults).toHaveLength(2);
    expect(syncResults[0].status).toBe('SYNCED');
    expect(syncResults[0].expenseId).toBeTruthy();
    expect(syncResults[1].status).toBe('FAILED');

    const syncReplayRes = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/mutations',
      headers: minh.authHeader,
      payload: { mutations: [validMutation] },
    });
    expect(syncReplayRes.statusCode).toBe(200);
    expect(syncReplayRes.json().results[0].status).toBe('ALREADY_SYNCED');
    expect(syncReplayRes.json().results[0].expenseId).toBe(syncResults[0].expenseId);

    // 10. Guest claim upgrade -> authenticates Lan and preserves membership & balance
    const lanUser = await createAuthedUser(app, otpProvider, '0905556677', 'Lan');
    const claimRes = await app.inject({
      method: 'POST',
      url: '/api/v1/invites/claim-guest',
      headers: lanUser.authHeader,
      payload: { guestToken: guestSession.guestToken },
    });
    expect(claimRes.statusCode).toBe(200);
    expect(claimRes.json().groupId).toBe(group.id);
    expect(claimRes.json().memberId).toBe(lanMemberId);

    const oldGuestTry = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${group.id}`,
      headers: guestHeaders,
    });
    expect(oldGuestTry.statusCode).toBe(401);

    const lanGroupRes = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${group.id}`,
      headers: lanUser.authHeader,
    });
    expect(lanGroupRes.statusCode).toBe(200);
    expect(lanGroupRes.json().group.myRole).toBe('MEMBER');
    expect(lanGroupRes.json().group.myBalanceVnd).toBe(-433333);
  });
});
