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

const testDb = createTestDb('group-lifecycle');

describe('Placeholder memberships and financial group lifecycle', () => {
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

  async function fixture() {
    const admin = await createAuthedUser(app, otpProvider, '0912345678', 'An');
    const friend = await createAuthedUser(app, otpProvider, '0987654321', 'Lan');
    const group = (await app.inject({ method: 'POST', url: '/api/v1/groups',
      headers: admin.authHeader, payload: { name: 'Hội bạn' } })).json().group;
    const base = '/api/v1/groups/' + group.id;
    const invite = '/api/v1/invites/' + group.inviteCode;
    const placeholder = (await app.inject({ method: 'POST', url: base + '/members',
      headers: admin.authHeader, payload: { displayName: 'Minh' } })).json().member;
    return { admin, friend, group, base, invite, placeholder };
  }

  it.each(['join', 'join-guest'])('claims a member in place through %s and preserves their balance', async route => {
    const { admin, friend, group, base, invite, placeholder } = await fixture();
    const expense = await app.inject({ method: 'POST', url: base + '/expenses', headers: admin.authHeader,
      payload: { title: 'Cà phê', amountVnd: 40000, paidByMemberId: group.myMemberId, splits: [{ memberId: placeholder.id }] } });
    expect(expense.statusCode).toBe(201);
    expect((await app.inject({ method: 'GET', url: invite })).json().claimableMembers)
      .toEqual([{ id: placeholder.id, displayName: 'Minh' }]);
    const joined = await app.inject({ method: 'POST', url: invite + '/' + route,
      headers: route === 'join' ? friend.authHeader : {}, payload: { claimMemberId: placeholder.id } });
    expect(joined.statusCode).toBe(201);
    expect(joined.json().memberId).toBe(placeholder.id);
    const headers = route === 'join' ? friend.authHeader : { 'x-guest-token': joined.json().guestToken };
    const balances = (await app.inject({ method: 'GET', url: base + '/balances', headers })).json();
    expect(balances.myNetBalanceVnd).toBe(-40000);
    expect(balances.memberBalances.find((m: { isMe: boolean }) => m.isMe).isPlaceholder).toBe(false);
    expect((await app.inject({ method: 'GET', url: invite })).json().claimableMembers).toEqual([]);
  });

  it('allows exactly one concurrent claimant', async () => {
    const { invite, friend, placeholder } = await fixture();
    const payload = { claimMemberId: placeholder.id };
    const results = await Promise.all([
      app.inject({ method: 'POST', url: invite + '/join', headers: friend.authHeader, payload }),
      app.inject({ method: 'POST', url: invite + '/join-guest', payload }),
    ]);
    expect(results.map(r => r.statusCode).sort()).toEqual([201, 409]);
    expect(results.find(r => r.statusCode === 409)!.json().error.code).toBe('MEMBER_ALREADY_CLAIMED');
  });

  it('records direct collection, handles pending placeholder payments and protects linked recipients', async () => {
    const { admin, friend, group, base, invite, placeholder } = await fixture();
    const memberId = (await app.inject({ method: 'POST', url: invite + '/join', headers: friend.authHeader })).json().memberId;
    const report = (fromMemberId: string, toMemberId: string, autoConfirm: boolean, headers = friend.authHeader) =>
      app.inject({ method: 'POST', url: base + '/settlements/report', headers,
        payload: { fromMemberId, toMemberId, amountVnd: 10000, method: 'CASH', autoConfirm } });
    const collected = await report(placeholder.id, memberId, true);
    expect(collected.statusCode).toBe(201);
    expect(collected.json().settlement.status).toBe('CONFIRMED');
    expect(collected.json().settlement.reportedAt).toBe(collected.json().settlement.confirmedAt);
    expect((await report(memberId, placeholder.id, true)).json().settlement.status).toBe('CONFIRMED');
    const pending = (await report(memberId, placeholder.id, false)).json().settlement;
    expect(pending.canConfirm).toBe(true);
    expect(pending.canReject).toBe(false);
    const confirm = (id: string, headers = friend.authHeader) => app.inject({ method: 'POST', url: '/api/v1/settlements/' + id + '/confirm', headers });
    expect((await confirm(pending.id)).statusCode).toBe(200);
    const pendingAdmin = (await report(memberId, placeholder.id, false)).json().settlement;
    expect((await confirm(pendingAdmin.id, admin.authHeader)).statusCode).toBe(200);
    expect((await report(group.myMemberId, memberId, true, admin.authHeader)).statusCode).toBe(403);
    const guest = (await app.inject({ method: 'POST', url: invite + '/join-guest', payload: { displayName: 'Hà' } })).json();
    expect((await report(memberId, guest.memberId, true)).statusCode).toBe(403);
    const linked = (await report(memberId, guest.memberId, false)).json().settlement;
    expect((await confirm(linked.id, admin.authHeader)).statusCode).toBe(403);
    expect((await confirm(linked.id)).statusCode).toBe(403);
  });

  it('requires an admin, zero balances and no pending settlement to delete group history', async () => {
    const { admin, friend, group, base, invite, placeholder } = await fixture();
    await app.inject({ method: 'POST', url: invite + '/join', headers: friend.authHeader });
    const remove = (headers = admin.authHeader) => app.inject({ method: 'DELETE', url: base, headers });
    expect((await remove(friend.authHeader)).statusCode).toBe(403);
    const expense = await app.inject({ method: 'POST', url: base + '/expenses', headers: admin.authHeader,
      payload: { title: 'Ăn trưa', amountVnd: 20000, paidByMemberId: group.myMemberId, splits: [{ memberId: placeholder.id }] } });
    expect(expense.statusCode).toBe(201);
    expect((await remove()).json().error.code).toBe('UNSETTLED_GROUP_CANNOT_DELETE');
    const payload = { amountVnd: 20000, fromMemberId: placeholder.id, toMemberId: group.myMemberId };
    await app.inject({ method: 'POST', url: base + '/settlements/report', headers: admin.authHeader, payload: { ...payload, autoConfirm: true } });
    const reported = (await app.inject({ method: 'POST', url: base + '/settlements/report', headers: admin.authHeader, payload })).json().settlement;
    expect((await remove()).json().error.code).toBe('UNSETTLED_GROUP_CANNOT_DELETE');
    await app.inject({ method: 'POST', url: '/api/v1/settlements/' + reported.id + '/reject', headers: admin.authHeader });
    expect((await remove()).statusCode).toBe(200);
    expect(await prisma.groupMember.count({ where: { groupId: group.id } })).toBe(0);
    expect(await prisma.expenseSplit.count()).toBe(0);
    expect(await prisma.activityLog.count({ where: { groupId: group.id } })).toBe(0);
  });
});
