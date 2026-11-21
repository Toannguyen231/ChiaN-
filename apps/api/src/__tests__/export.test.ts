import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import {
  CaptureOtpProvider,
  createAuthedUser,
  createTestDb,
  resetDb,
} from './test-helpers';

const testDb = createTestDb('export');

describe('ChiaNè Excel Export, Dashboard Pending Banners & Push Token API', () => {
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

  it('rejects unauthenticated or non-member Excel export requests', async () => {
    const owner = await createAuthedUser(app, otpProvider, '0911111111', 'An');
    const outsider = await createAuthedUser(app, otpProvider, '0922222222', 'Khách lạ');

    const groupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/groups',
      headers: owner.authHeader,
      payload: { name: 'Team Private', category: 'TRAVEL' },
    });
    const groupId = groupRes.json().group.id;

    const unauthRes = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${groupId}/export/xlsx`,
    });
    expect(unauthRes.statusCode).toBe(401);

    const outsiderRes = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${groupId}/export/xlsx-base64`,
      headers: outsider.authHeader,
    });
    expect(outsiderRes.statusCode).toBe(403);
  });

  it('exports a valid 4-sheet Excel workbook and returns clickable pending confirmation banners on dashboard', async () => {
    const an = await createAuthedUser(app, otpProvider, '0912345678', 'An');
    const binh = await createAuthedUser(app, otpProvider, '0987654321', 'Bình');

    const groupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/groups',
      headers: an.authHeader,
      payload: { name: 'Phượt Đà Lạt', category: 'TRAVEL' },
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

    // 1. Contribute to Group Pot
    const potRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/pot/contribute`,
      headers: an.authHeader,
      payload: { memberId: group.myMemberId, amountVnd: 500_000, note: 'Đóng quỹ đầu chuyến' },
    });
    expect(potRes.statusCode).toBe(201);

    // 2. Add a regular expense paid by An (Bình owes An 150,000)
    const exp1Res = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/expenses`,
      headers: an.authHeader,
      payload: {
        title: 'Lẩu gà lá é',
        amountVnd: 300_000,
        category: 'FOOD',
        splitMethod: 'EQUAL',
        paidByMemberId: group.myMemberId,
        splits: [
          { memberId: group.myMemberId },
          { memberId: binhMemberId },
        ],
      },
    });
    expect(exp1Res.statusCode).toBe(201);

    // 3. Bình reports payment of 150,000 to An
    const reportRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/settlements/report`,
      headers: binh.authHeader,
      payload: {
        fromMemberId: binhMemberId,
        toMemberId: group.myMemberId,
        amountVnd: 150_000,
        method: 'BANK_TRANSFER',
        memo: 'Bình gửi tiền lẩu',
      },
    });
    expect(reportRes.statusCode).toBe(201);
    const settlementId = reportRes.json().settlement.id;

    // 4. Verify Dashboard returns actionable pendingConfirmations banner for An
    const dashRes = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
      headers: an.authHeader,
    });
    expect(dashRes.statusCode).toBe(200);
    const dash = dashRes.json();
    expect(dash.pendingConfirmationsCount).toBe(1);
    expect(dash.pendingConfirmations).toHaveLength(1);
    expect(dash.pendingConfirmations[0]).toMatchObject({
      settlementId,
      groupId: group.id,
      groupName: 'Phượt Đà Lạt',
      fromName: 'Bình',
      amountVnd: 150_000,
    });

    // 5. Verify raw binary .xlsx endpoint starts with ZIP PK magic bytes
    const binRes = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${group.id}/export/xlsx`,
      headers: an.authHeader,
    });
    expect(binRes.statusCode).toBe(200);
    expect(binRes.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(binRes.rawPayload[0]).toBe(0x50);
    expect(binRes.rawPayload[1]).toBe(0x4b);

    // 6. Verify base64 endpoint decodes into a valid 4-sheet workbook
    const b64Res = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${group.id}/export/xlsx-base64`,
      headers: binh.authHeader,
    });
    expect(b64Res.statusCode).toBe(200);
    const b64Body = b64Res.json();
    expect(b64Body.filename).toMatch(/^ChiaNe-Phuot-Da-Lat-\d{4}-\d{2}-\d{2}\.xlsx$/);

    const decoded = Buffer.from(b64Body.base64, 'base64');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(decoded as unknown as Parameters<typeof wb.xlsx.load>[0]);

    expect(wb.worksheets.map((ws) => ws.name)).toEqual([
      'Tổng quan',
      'Chi tiết khoản chi',
      'Lịch sử thanh toán',
      'Quỹ chung nhóm',
    ]);

    const expenseSheet = wb.getWorksheet('Chi tiết khoản chi')!;
    expect(expenseSheet.rowCount).toBeGreaterThanOrEqual(2);
    expect(expenseSheet.getRow(2).getCell(3).value).toBe('Lẩu gà lá é');
    expect(expenseSheet.getRow(2).getCell(5).value).toBe(300_000);

    const settlementSheet = wb.getWorksheet('Lịch sử thanh toán')!;
    expect(settlementSheet.rowCount).toBeGreaterThanOrEqual(2);
    expect(settlementSheet.getRow(2).getCell(5).value).toBe(150_000);
  });

  it('registers and clears Expo push token on authenticated profile', async () => {
    const user = await createAuthedUser(app, otpProvider, '0933333333', 'Minh');

    const badRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/me/push-token',
      headers: user.authHeader,
      payload: { expoPushToken: 'invalid-token-format' },
    });
    expect(badRes.statusCode).toBe(400);

    const saveRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/me/push-token',
      headers: user.authHeader,
      payload: { expoPushToken: 'ExponentPushToken[chiane-test-device]' },
    });
    expect(saveRes.statusCode).toBe(200);
    expect(saveRes.json()).toEqual({
      registered: true,
      expoPushToken: 'ExponentPushToken[chiane-test-device]',
    });

    const getRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me/push-token',
      headers: user.authHeader,
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().registered).toBe(true);

    const clearRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/me/push-token',
      headers: user.authHeader,
      payload: { expoPushToken: null },
    });
    expect(clearRes.statusCode).toBe(200);
    expect(clearRes.json()).toEqual({ registered: false, expoPushToken: null });
  });
});
