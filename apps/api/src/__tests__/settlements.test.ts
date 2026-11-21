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

const testDb = createTestDb('settlements');

describe('ChiaNè Debt Optimization & VietQR Payment API (Module 04)', () => {
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

  it('optimizes transfers, gates VietQR on real bank info, blocks premature balance updates & enforces recipient-only confirmation', async () => {
    const an = await createAuthedUser(app, otpProvider, '0912345678', 'An');
    const linh = await createAuthedUser(app, otpProvider, '0987654321', 'Linh');
    const minh = await createAuthedUser(app, otpProvider, '0901112233', 'Minh');

    // Linh configures real MB Bank details; Minh has NO bank details
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: linh.authHeader,
      payload: {
        bankBin: '970422',
        bankName: 'MB Bank',
        bankAccountNumber: '0987654321',
        bankAccountHolder: 'NGUYEN THUY LINH',
      },
    });

    const groupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/groups',
      headers: an.authHeader,
      payload: { name: 'Đà Lạt cuối tuần', category: 'TRAVEL' },
    });
    const group = groupRes.json().group;
    const anId = group.myMemberId;
    const linhId = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/invites/${group.inviteCode}/join`,
        headers: linh.authHeader,
      })
    ).json().memberId;
    const minhId = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/invites/${group.inviteCode}/join`,
        headers: minh.authHeader,
      })
    ).json().memberId;

    // Linh pays 1,200,000 split 3 ways (An -400k, Minh -400k, Linh +800k)
    await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/expenses`,
      headers: linh.authHeader,
      payload: {
        title: 'Homestay',
        amountVnd: 1200000,
        category: 'STAY',
        splitMethod: 'EQUAL',
        paidByMemberId: linhId,
        splits: [{ memberId: anId }, { memberId: linhId }, { memberId: minhId }],
      },
    });

    const balancesRes = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${group.id}/balances`,
      headers: an.authHeader,
    });
    expect(balancesRes.statusCode).toBe(200);
    expect(balancesRes.json().myNetBalanceVnd).toBe(-400000);
    expect(balancesRes.json().suggestedTransfers).toHaveLength(2);

    // An reports transfer to Linh with idempotencyKey
    const reportRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/settlements/report`,
      headers: an.authHeader,
      payload: {
        fromMemberId: anId,
        toMemberId: linhId,
        amountVnd: 400000,
        method: 'BANK_TRANSFER',
        memo: 'An tra tien Da Lat',
        idempotencyKey: 'stl-an-linh-400k',
      },
    });
    expect(reportRes.statusCode).toBe(201);
    const settlement = reportRes.json().settlement;
    expect(settlement.status).toBe('REPORTED');
    expect(settlement.vietQrPayload).toBeTruthy();
    expect(settlement.vietQrPayload.startsWith('000201')).toBe(true);
    expect(settlement.toBankPreview.hasRealBank).toBe(true);

    // Replay same idempotencyKey returns 200 with identical settlement record
    const replayRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/settlements/report`,
      headers: an.authHeader,
      payload: {
        fromMemberId: anId,
        toMemberId: linhId,
        amountVnd: 400000,
        method: 'BANK_TRANSFER',
        memo: 'An tra tien Da Lat',
        idempotencyKey: 'stl-an-linh-400k',
      },
    });
    expect(replayRes.statusCode).toBe(200);
    expect(replayRes.json().settlement.id).toBe(settlement.id);

    // Balances MUST NOT change while REPORTED
    const balancesWhileReported = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${group.id}/balances`,
      headers: an.authHeader,
    });
    expect(balancesWhileReported.json().myNetBalanceVnd).toBe(-400000);

    // Payer An CANNOT confirm their own settlement (403)
    const selfConfirm = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${settlement.id}/confirm`,
      headers: an.authHeader,
    });
    expect(selfConfirm.statusCode).toBe(403);
    expect(selfConfirm.json().error.code).toBe('ONLY_RECIPIENT_CAN_CONFIRM');

    // Recipient Linh confirms -> An balance becomes 0
    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${settlement.id}/confirm`,
      headers: linh.authHeader,
    });
    expect(confirmRes.statusCode).toBe(200);
    expect(confirmRes.json().settlement.status).toBe('CONFIRMED');

    const balancesAfterConfirm = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${group.id}/balances`,
      headers: an.authHeader,
    });
    expect(balancesAfterConfirm.json().myNetBalanceVnd).toBe(0);

    // Also test reject flow & null QR when recipient has NO bank info (Minh)
    await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/expenses`,
      headers: minh.authHeader,
      payload: {
        title: 'Cà phê',
        amountVnd: 100000,
        category: 'COFFEE',
        splitMethod: 'EQUAL',
        paidByMemberId: minhId,
        splits: [{ memberId: anId }, { memberId: minhId }],
      },
    });

    const reportNoBank = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/settlements/report`,
      headers: an.authHeader,
      payload: {
        fromMemberId: anId,
        toMemberId: minhId,
        amountVnd: 50000,
        method: 'CASH',
        idempotencyKey: 'stl-an-minh-cash',
      },
    });
    expect(reportNoBank.statusCode).toBe(201);
    expect(reportNoBank.json().settlement.vietQrPayload).toBeNull();
    expect(reportNoBank.json().settlement.toBankPreview.hasRealBank).toBe(false);

    const rejectRes = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${reportNoBank.json().settlement.id}/reject`,
      headers: minh.authHeader,
      payload: { reason: 'Chưa gặp mặt đưa tiền mặt' },
    });
    expect(rejectRes.statusCode).toBe(200);
    expect(rejectRes.json().settlement.status).toBe('REJECTED');
    expect(rejectRes.json().settlement.rejectReason).toBe('Chưa gặp mặt đưa tiền mặt');
  });
});
