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

const testDb = createTestDb('groups');

describe('ChiaNè Dashboard & Group Management API (Module 02)', () => {
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

  it('creates group as ADMIN, joins via invite code, regenerates link, and enforces RBAC', async () => {
    const an = await createAuthedUser(app, otpProvider, '0912345678', 'An');
    const linh = await createAuthedUser(app, otpProvider, '0987654321', 'Linh');
    const stranger = await createAuthedUser(app, otpProvider, '0901112233', 'Stranger');

    // Create group
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/groups',
      headers: an.authHeader,
      payload: { name: 'Đà Lạt cuối tuần', category: 'TRAVEL', currency: 'VND' },
    });
    expect(createRes.statusCode).toBe(201);
    const createdGroup = createRes.json().group;
    expect(createdGroup.name).toBe('Đà Lạt cuối tuần');
    expect(createdGroup.myRole).toBe('ADMIN');
    expect(createdGroup.memberCount).toBe(1);
    expect(createdGroup.inviteCode).toBeTruthy();

    // Non-member cannot read group
    const deniedRes = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${createdGroup.id}`,
      headers: stranger.authHeader,
    });
    expect(deniedRes.statusCode).toBe(403);

    // Linh joins via invite code
    const joinRes = await app.inject({
      method: 'POST',
      url: `/api/v1/invites/${createdGroup.inviteCode.toUpperCase()}/join`,
      headers: linh.authHeader,
    });
    expect(joinRes.statusCode).toBe(201);
    expect(joinRes.json().groupId).toBe(createdGroup.id);

    // Linh (MEMBER) cannot rename group
    const memberRename = await app.inject({
      method: 'PATCH',
      url: `/api/v1/groups/${createdGroup.id}`,
      headers: linh.authHeader,
      payload: { name: 'Tên mới' },
    });
    expect(memberRename.statusCode).toBe(403);

    // An (ADMIN) renames group and regenerates invite link
    const adminRename = await app.inject({
      method: 'PATCH',
      url: `/api/v1/groups/${createdGroup.id}`,
      headers: an.authHeader,
      payload: { name: 'Đà Lạt tháng 11' },
    });
    expect(adminRename.statusCode).toBe(200);
    expect(adminRename.json().group.name).toBe('Đà Lạt tháng 11');

    const regenRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${createdGroup.id}/invite-link/regenerate`,
      headers: an.authHeader,
    });
    expect(regenRes.statusCode).toBe(200);
    const nextCode = regenRes.json().inviteCode;
    expect(nextCode).not.toBe(createdGroup.inviteCode);

    // Old invite code now returns 404
    const oldJoinRes = await app.inject({
      method: 'POST',
      url: `/api/v1/invites/${createdGroup.inviteCode}/join`,
      headers: stranger.authHeader,
    });
    expect(oldJoinRes.statusCode).toBe(404);
  });

  it('supports list filtering (active/archived/search), dashboard summary, member add/remove & leave rules', async () => {
    const an = await createAuthedUser(app, otpProvider, '0912345678', 'An');
    const linh = await createAuthedUser(app, otpProvider, '0987654321', 'Linh');

    const g1Res = await app.inject({
      method: 'POST',
      url: '/api/v1/groups',
      headers: an.authHeader,
      payload: { name: 'Ăn gì cũng được', category: 'FOOD' },
    });
    const g1 = g1Res.json().group;

    // Add Linh via phone lookup
    const addMemberRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${g1.id}/members`,
      headers: an.authHeader,
      payload: { displayName: 'Linh', phone: '0987654321' },
    });
    expect(addMemberRes.statusCode).toBe(201);
    const linhMemberId = addMemberRes.json().member.id;

    // Also add manual placeholder member Huy
    const addHuyRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${g1.id}/members`,
      headers: an.authHeader,
      payload: { displayName: 'Huy' },
    });
    expect(addHuyRes.statusCode).toBe(201);
    const huyMemberId = addHuyRes.json().member.id;

    // Dashboard returns 1 active group and zero balances
    const dashRes = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
      headers: an.authHeader,
    });
    expect(dashRes.statusCode).toBe(200);
    expect(dashRes.json().totalOwedToYouVnd).toBe(0);
    expect(dashRes.json().recentGroups).toHaveLength(1);

    // Record unsettled balance directly in DB via expense to verify removal & leave guards
    await prisma.expense.create({
      data: {
        groupId: g1.id,
        title: 'Bún bò',
        amountVnd: 200000,
        category: 'FOOD',
        splitMethod: 'EQUAL',
        paidByMemberId: g1.myMemberId,
        createdByMemberId: g1.myMemberId,
        splits: {
          create: [
            { memberId: g1.myMemberId, amountVnd: 100000 },
            { memberId: linhMemberId, amountVnd: 100000 },
          ],
        },
      },
    });

    // Dashboard now reflects +100k owed to An and -100k owed by Linh
    const anDash = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
      headers: an.authHeader,
    });
    expect(anDash.json().totalOwedToYouVnd).toBe(100000);

    const linhDash = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
      headers: linh.authHeader,
    });
    expect(linhDash.json().totalYouOweVnd).toBe(100000);

    // Member details for Linh shows transaction & canRemove=false because balance != 0
    const memberDetailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${g1.id}/members/${linhMemberId}`,
      headers: an.authHeader,
    });
    expect(memberDetailRes.statusCode).toBe(200);
    expect(memberDetailRes.json().member.netBalanceVnd).toBe(-100000);
    expect(memberDetailRes.json().canRemove).toBe(false);
    expect(memberDetailRes.json().transactions).toHaveLength(1);

    // Removing Linh fails with 400 UNSETTLED_BALANCE
    const removeFail = await app.inject({
      method: 'DELETE',
      url: `/api/v1/groups/${g1.id}/members/${linhMemberId}`,
      headers: an.authHeader,
    });
    expect(removeFail.statusCode).toBe(400);
    expect(removeFail.json().error.code).toBe('UNSETTLED_BALANCE');

    // Linh leaving fails with 400 UNSETTLED_BALANCE
    const leaveFail = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${g1.id}/leave`,
      headers: linh.authHeader,
    });
    expect(leaveFail.statusCode).toBe(400);

    // Removing balanced member Huy succeeds
    const removeHuy = await app.inject({
      method: 'DELETE',
      url: `/api/v1/groups/${g1.id}/members/${huyMemberId}`,
      headers: an.authHeader,
    });
    expect(removeHuy.statusCode).toBe(200);

    // Archive group hides it from active list and moves it to archived=true
    const archiveRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${g1.id}/archive`,
      headers: an.authHeader,
      payload: { archived: true },
    });
    expect(archiveRes.statusCode).toBe(200);

    const activeList = await app.inject({
      method: 'GET',
      url: '/api/v1/groups?archived=false',
      headers: an.authHeader,
    });
    expect(activeList.json().groups).toHaveLength(0);

    const archivedList = await app.inject({
      method: 'GET',
      url: '/api/v1/groups?archived=true&search=ăn',
      headers: an.authHeader,
    });
    expect(archivedList.json().groups).toHaveLength(1);

    // Test admin leave promotes remaining balanced member
    const g2Res = await app.inject({
      method: 'POST',
      url: '/api/v1/groups',
      headers: an.authHeader,
      payload: { name: 'Nhà chung', category: 'HOUSEHOLD' },
    });
    const g2 = g2Res.json().group;
    await app.inject({
      method: 'POST',
      url: `/api/v1/invites/${g2.inviteCode}/join`,
      headers: linh.authHeader,
    });

    const leavePromote = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${g2.id}/leave`,
      headers: an.authHeader,
    });
    expect(leavePromote.statusCode).toBe(200);
    expect(leavePromote.json().promotedMemberId).toBeTruthy();

    const g2After = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/${g2.id}`,
      headers: linh.authHeader,
    });
    expect(g2After.statusCode).toBe(200);
    expect(g2After.json().group.myRole).toBe('ADMIN');
  });
});
