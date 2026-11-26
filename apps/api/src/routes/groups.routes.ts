import { joinInviteSchema } from '@chiane/shared';
import { claimPlaceholder, isPlaceholder } from '../services/placeholder.service';
import type {
  GroupMemberRole,
  GroupMemberStatus,
  MemberDetailDto,
  MemberTransactionDto,
  SettlementStatus,
} from '@chiane/shared';
import {
  addMemberSchema,
  archiveGroupSchema,
  createGroupSchema,
  maskVnPhone,
  updateGroupSchema,
} from '@chiane/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { createRequireGroupRole } from '../middleware/rbac';
import { logActivity } from '../services/activity.service';
import {
  assertNotArchived,
  buildBankPreview,
  computeGroupFinancials,
  formatInviteLink,
} from '../services/balance.service';
import {
  generateUniqueInviteCode,
  getGroupDetailForMember,
  getGroupSummaryForMember,
} from '../services/group.service';
import { AppError } from '../utils/errors';

export interface GroupsRoutesDeps {
  prisma: PrismaClient;
  requireAuth: preHandlerHookHandler;
  requireAuthOrGuest: preHandlerHookHandler;
}

export async function registerGroupsRoutes(
  app: FastifyInstance,
  deps: GroupsRoutesDeps
): Promise<void> {
  const { prisma, requireAuth, requireAuthOrGuest } = deps;

  app.get('/api/v1/groups', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.authUser!.userId;
    const query = (request.query ?? {}) as { archived?: string; search?: string };
    const isArchived = query.archived === 'true';
    const searchTerm = (query.search ?? '').trim().toLowerCase();

    const memberships = await prisma.groupMember.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        group: { isArchived },
      },
      include: {
        group: { select: { id: true, name: true, updatedAt: true } },
      },
      orderBy: { group: { updatedAt: 'desc' } },
    });

    const filtered = searchTerm
      ? memberships.filter((m) => m.group.name.toLowerCase().includes(searchTerm))
      : memberships;

    const groups = await Promise.all(
      filtered.map((m) =>
        getGroupSummaryForMember(prisma, m.groupId, m.id, m.role as GroupMemberRole)
      )
    );

    return reply.status(200).send({ groups });
  });

  app.post('/api/v1/groups', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.authUser!.userId;
    const input = createGroupSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản.');
    }

    const displayName = user.displayName.trim() || maskVnPhone(user.phone);
    const inviteCode = await generateUniqueInviteCode(prisma, input.name);

    const created = await prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          name: input.name,
          category: input.category,
          currency: input.currency,
          inviteCode,
          createdByUserId: userId,
        },
      });

      const member = await tx.groupMember.create({
        data: {
          groupId: group.id,
          userId,
          displayName,
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });

      await logActivity(tx, {
        groupId: group.id,
        actorMemberId: member.id,
        type: 'GROUP_CREATED',
        title: `${displayName} đã tạo nhóm`,
        subtitle: group.name,
        metadata: { memberId: member.id },
      });

      return { groupId: group.id, memberId: member.id };
    });

    const detail = await getGroupDetailForMember(
      prisma,
      created.groupId,
      created.memberId,
      'ADMIN'
    );

    return reply.status(201).send({ group: detail });
  });

  app.get(
    '/api/v1/groups/:groupId',
    { preHandler: [requireAuthOrGuest, createRequireGroupRole(prisma, ['ADMIN', 'MEMBER', 'GUEST'])] },
    async (request, reply) => {
      const membership = request.groupMembership!;
      const group = await getGroupDetailForMember(
        prisma,
        membership.groupId,
        membership.memberId,
        membership.role as GroupMemberRole
      );
      return reply.status(200).send({ group });
    }
  );

  app.patch(
    '/api/v1/groups/:groupId',
    { preHandler: [requireAuthOrGuest, createRequireGroupRole(prisma, ['ADMIN'])] },
    async (request, reply) => {
      const membership = request.groupMembership!;
      const input = updateGroupSchema.parse(request.body);

      await assertNotArchived(prisma, membership.groupId);

      await prisma.group.update({
        where: { id: membership.groupId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
        },
      });

      const group = await getGroupDetailForMember(
        prisma,
        membership.groupId,
        membership.memberId,
        membership.role as GroupMemberRole
      );
      return reply.status(200).send({ group });
    }
  );

  app.post(
    '/api/v1/groups/:groupId/archive',
    { preHandler: [requireAuthOrGuest, createRequireGroupRole(prisma, ['ADMIN'])] },
    async (request, reply) => {
      const membership = request.groupMembership!;
      const input = archiveGroupSchema.parse(request.body ?? {});

      await prisma.group.update({
        where: { id: membership.groupId },
        data: { isArchived: input.archived },
      });

      const group = await getGroupDetailForMember(
        prisma,
        membership.groupId,
        membership.memberId,
        membership.role as GroupMemberRole
      );
      return reply.status(200).send({ group });
    }
  );

  app.post(
    '/api/v1/groups/:groupId/leave',
    { preHandler: [requireAuthOrGuest, createRequireGroupRole(prisma, ['ADMIN', 'MEMBER'])] },
    async (request, reply) => {
      const membership = request.groupMembership!;
      const financials = await computeGroupFinancials(prisma, membership.groupId);
      const myNetBalance = financials.balancesMap.get(membership.memberId) ?? 0;

      if (myNetBalance !== 0) {
        throw new AppError(
          400,
          'UNSETTLED_BALANCE',
          'Bạn cần hoàn tất số dư trước khi rời nhóm.',
          { netBalanceVnd: myNetBalance }
        );
      }

      const activeMembers = await prisma.groupMember.findMany({
        where: { groupId: membership.groupId, status: 'ACTIVE' },
        orderBy: { joinedAt: 'asc' },
      });

      const others = activeMembers.filter((m) => m.id !== membership.memberId);
      const otherAdmins = others.filter((m) => m.role === 'ADMIN');
      const otherRegularMembers = others.filter((m) => m.role === 'MEMBER');

      let promotedMemberId: string | null = null;
      let archivedGroup = false;

      await prisma.$transaction(async (tx) => {
        if (membership.role === 'ADMIN' && otherAdmins.length === 0) {
          if (otherRegularMembers.length > 0) {
            const candidate = otherRegularMembers[0]!;
            await tx.groupMember.update({
              where: { id: candidate.id },
              data: { role: 'ADMIN' },
            });
            promotedMemberId = candidate.id;
          } else if (others.length === 0) {
            await tx.group.update({
              where: { id: membership.groupId },
              data: { isArchived: true },
            });
            archivedGroup = true;
          }
        }

        await tx.groupMember.update({
          where: { id: membership.memberId },
          data: { status: 'LEFT' },
        });

        await logActivity(tx, {
          groupId: membership.groupId,
          actorMemberId: membership.memberId,
          type: 'MEMBER_LEFT',
          title: `${membership.displayName} đã rời nhóm`,
          subtitle: promotedMemberId ? 'Đã chuyển quyền trưởng nhóm' : 'Thành viên đã rời nhóm',
          metadata: { memberId: membership.memberId },
        });
      });

      return reply.status(200).send({
        success: true,
        archivedGroup,
        promotedMemberId,
      });
    }
  );

  app.post(
    '/api/v1/groups/:groupId/invite-link/regenerate',
    { preHandler: [requireAuthOrGuest, createRequireGroupRole(prisma, ['ADMIN'])] },
    async (request, reply) => {
      const membership = request.groupMembership!;
      const group = await assertNotArchived(prisma, membership.groupId);
      const nextCode = await generateUniqueInviteCode(prisma, group.name);

      await prisma.group.update({
        where: { id: membership.groupId },
        data: { inviteCode: nextCode },
      });

      return reply.status(200).send({
        inviteCode: nextCode,
        inviteLink: formatInviteLink(nextCode),
      });
    }
  );

  app.post(
    '/api/v1/groups/:groupId/members',
    { preHandler: [requireAuthOrGuest, createRequireGroupRole(prisma, ['ADMIN'])] },
    async (request, reply) => {
      const membership = request.groupMembership!;
      const input = addMemberSchema.parse(request.body);
      await assertNotArchived(prisma, membership.groupId);

      let matchedUserId: string | null = null;
      if (input.phone) {
        const matchedUser = await prisma.user.findUnique({
          where: { phone: input.phone },
          select: { id: true },
        });
        matchedUserId = matchedUser?.id ?? null;
      }

      const memberRecord = await prisma.$transaction(async (tx) => {
        let createdOrUpdated;
        if (matchedUserId) {
          const existing = await tx.groupMember.findFirst({
            where: { groupId: membership.groupId, userId: matchedUserId },
          });
          if (existing) {
            if (existing.status === 'ACTIVE') {
              throw new AppError(409, 'ALREADY_MEMBER', 'Thành viên này đã có mặt trong nhóm.');
            }
            createdOrUpdated = await tx.groupMember.update({
              where: { id: existing.id },
              data: {
                status: 'ACTIVE',
                role: 'MEMBER',
                displayName: input.displayName,
              },
              include: {
                user: {
                  select: {
                    bankBin: true,
                    bankName: true,
                    bankAccountNumber: true,
                    bankAccountHolder: true,
                  },
                },
              },
            });
          }
        }

        if (!createdOrUpdated) {
          createdOrUpdated = await tx.groupMember.create({
            data: {
              groupId: membership.groupId,
              userId: matchedUserId,
              displayName: input.displayName,
              role: 'MEMBER',
              status: 'ACTIVE',
            },
            include: {
              user: {
                select: {
                  bankBin: true,
                  bankName: true,
                  bankAccountNumber: true,
                  bankAccountHolder: true,
                },
              },
            },
          });
        }

        await logActivity(tx, {
          groupId: membership.groupId,
          actorMemberId: membership.memberId,
          type: 'MEMBER_JOINED',
          title: `${createdOrUpdated.displayName} đã được thêm vào nhóm`,
          subtitle: `Thêm bởi ${membership.displayName}`,
          metadata: { memberId: createdOrUpdated.id },
        });

        return createdOrUpdated;
      });

      const financials = await computeGroupFinancials(prisma, membership.groupId);

      return reply.status(201).send({
        member: {
          id: memberRecord.id,
          userId: memberRecord.userId,
          isPlaceholder: isPlaceholder(memberRecord),
          displayName: memberRecord.displayName,
          role: memberRecord.role as GroupMemberRole,
          status: memberRecord.status as GroupMemberStatus,
          netBalanceVnd: financials.balancesMap.get(memberRecord.id) ?? 0,
          isMe: memberRecord.id === membership.memberId,
          bankPreview: buildBankPreview(memberRecord.user),
          joinedAt: memberRecord.joinedAt.toISOString(),
        },
      });
    }
  );

  app.delete(
    '/api/v1/groups/:groupId/members/:memberId',
    { preHandler: [requireAuthOrGuest, createRequireGroupRole(prisma, ['ADMIN'])] },
    async (request, reply) => {
      const membership = request.groupMembership!;
      const { memberId } = request.params as { groupId: string; memberId: string };
      await assertNotArchived(prisma, membership.groupId);

      if (memberId === membership.memberId) {
        throw new AppError(
          400,
          'CANNOT_REMOVE_SELF',
          'Bạn không thể tự xóa chính mình. Hãy chọn Rời nhóm.'
        );
      }

      const target = await prisma.groupMember.findFirst({
        where: { id: memberId, groupId: membership.groupId, status: 'ACTIVE' },
      });

      if (!target) {
        throw new AppError(404, 'MEMBER_NOT_FOUND', 'Không tìm thấy thành viên trong nhóm.');
      }

      const financials = await computeGroupFinancials(prisma, membership.groupId);
      const targetBalance = financials.balancesMap.get(target.id) ?? 0;

      if (targetBalance !== 0) {
        throw new AppError(
          400,
          'UNSETTLED_BALANCE',
          'Không thể xóa thành viên khi số dư chưa cân bằng.',
          { netBalanceVnd: targetBalance }
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.groupMember.update({
          where: { id: target.id },
          data: { status: 'REMOVED', guestTokenHash: null },
        });

        await logActivity(tx, {
          groupId: membership.groupId,
          actorMemberId: membership.memberId,
          type: 'MEMBER_REMOVED',
          title: `${target.displayName} đã rời khỏi nhóm`,
          subtitle: `Cập nhật bởi ${membership.displayName}`,
          metadata: { memberId: target.id },
        });
      });

      return reply.status(200).send({ success: true });
    }
  );

  app.get(
    '/api/v1/groups/:groupId/members/:memberId',
    { preHandler: [requireAuthOrGuest, createRequireGroupRole(prisma, ['ADMIN', 'MEMBER', 'GUEST'])] },
    async (request, reply) => {
      const membership = request.groupMembership!;
      const { memberId } = request.params as { groupId: string; memberId: string };

      const [group, target, financials, expenses, settlements] = await Promise.all([
        prisma.group.findUnique({
          where: { id: membership.groupId },
          select: { name: true },
        }),
        prisma.groupMember.findFirst({
          where: { id: memberId, groupId: membership.groupId },
          include: {
            user: {
              select: {
                bankBin: true,
                bankName: true,
                bankAccountNumber: true,
                bankAccountHolder: true,
              },
            },
          },
        }),
        computeGroupFinancials(prisma, membership.groupId),
        prisma.expense.findMany({
          where: {
            groupId: membership.groupId,
            deletedAt: null,
            OR: [
              { paidByMemberId: memberId },
              { splits: { some: { memberId } } },
            ],
          },
          include: {
            paidByMember: { select: { displayName: true } },
            splits: { where: { memberId } },
          },
          orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        }),
        prisma.settlement.findMany({
          where: {
            groupId: membership.groupId,
            OR: [{ fromMemberId: memberId }, { toMemberId: memberId }],
          },
          include: {
            fromMember: { select: { displayName: true } },
            toMember: { select: { displayName: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      if (!target || !group) {
        throw new AppError(404, 'MEMBER_NOT_FOUND', 'Không tìm thấy thành viên.');
      }

      let totalPaidVnd = 0;
      let totalShareVnd = 0;
      const transactions: MemberTransactionDto[] = [];

      for (const exp of expenses) {
        const mySplit = exp.splits[0]?.amountVnd ?? 0;
        const paidContribution =
          !exp.isPaidFromPot && exp.paidByMemberId === memberId ? exp.amountVnd : 0;
        const signedImpactVnd = exp.isPaidFromPot ? 0 : paidContribution - mySplit;
        totalPaidVnd += paidContribution;
        totalShareVnd += exp.isPaidFromPot ? 0 : mySplit;
        transactions.push({
          id: exp.id,
          kind: 'EXPENSE',
          title: exp.title,
          subtitle: exp.isPaidFromPot
            ? 'Trừ từ quỹ chung nhóm'
            : exp.paidByMemberId === memberId
              ? 'Đã trả cho nhóm'
              : `${exp.paidByMember.displayName} đã trả`,
          amountVnd: exp.amountVnd,
          signedImpactVnd,
          occurredAt: exp.expenseDate.toISOString(),
        });
      }

      for (const stl of settlements) {
        const isSender = stl.fromMemberId === memberId;
        transactions.push({
          id: stl.id,
          kind: 'SETTLEMENT',
          title: isSender
            ? `Chuyển cho ${stl.toMember.displayName}`
            : `Nhận từ ${stl.fromMember.displayName}`,
          subtitle:
            stl.status === 'CONFIRMED'
              ? 'Đã xác nhận'
              : stl.status === 'REJECTED'
                ? 'Đã từ chối'
                : 'Chờ xác nhận',
          amountVnd: stl.amountVnd,
          signedImpactVnd:
            stl.status === 'CONFIRMED'
              ? isSender
                ? stl.amountVnd
                : -stl.amountVnd
              : 0,
          occurredAt: (stl.confirmedAt ?? stl.reportedAt ?? stl.createdAt).toISOString(),
          status: stl.status as SettlementStatus,
        });
      }

      transactions.sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
      );

      const netBalanceVnd = financials.balancesMap.get(target.id) ?? 0;
      const canRemove =
        membership.role === 'ADMIN' &&
        target.status === 'ACTIVE' &&
        target.id !== membership.memberId &&
        netBalanceVnd === 0;

      const detail: MemberDetailDto = {
        member: {
          id: target.id,
          userId: target.userId,
          isPlaceholder: isPlaceholder(target),
          displayName: target.displayName,
          role: target.role as GroupMemberRole,
          status: target.status as GroupMemberStatus,
          netBalanceVnd,
          isMe: target.id === membership.memberId,
          bankPreview: buildBankPreview(target.user),
          joinedAt: target.joinedAt.toISOString(),
        },
        groupId: membership.groupId,
        groupName: group.name,
        totalPaidVnd,
        totalShareVnd,
        canRemove,
        transactions,
      };

      return reply.status(200).send(detail);
    }
  );

  app.delete('/api/v1/groups/:groupId', {
    preHandler: [requireAuth, createRequireGroupRole(prisma, ['ADMIN'])],
  }, async (request, reply) => {
    const { groupId } = request.groupMembership!;
    await prisma.$transaction(async (tx) => {
      const financials = await computeGroupFinancials(tx, groupId);
      const pending = await tx.settlement.count({ where: { groupId, status: 'REPORTED' } });
      if (pending || financials.memberBalances.some(m => m.netBalanceVnd !== 0)) {
        throw new AppError(400, 'UNSETTLED_GROUP_CANNOT_DELETE', 'Nhóm còn số dư hoặc thanh toán chờ xác nhận. Hãy tất toán trước khi xóa nhé.');
      }
      await tx.paymentReminder.deleteMany({ where: { groupId } });
      await tx.settlement.deleteMany({ where: { groupId } });
      await tx.expense.deleteMany({ where: { groupId } });
      await tx.group.delete({ where: { id: groupId } });
    }, { isolationLevel: 'Serializable' });
    return reply.send({ success: true });
  });

  app.post(
    '/api/v1/invites/:inviteCode/join',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.authUser!.userId;
      const { inviteCode } = request.params as { inviteCode: string };
      const { claimMemberId } = joinInviteSchema.parse(request.body ?? {});
      const normalizedCode = inviteCode.trim().toLowerCase();

      const group = await prisma.group.findFirst({
        where: { inviteCode: normalizedCode },
      });

      if (!group) {
        throw new AppError(404, 'INVITE_NOT_FOUND', 'Liên kết mời không hợp lệ hoặc đã hết hạn.');
      }

      if (group.isArchived) {
        throw new AppError(400, 'GROUP_ARCHIVED', 'Nhóm này đã được lưu trữ.');
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản.');
      }

      const existing = await prisma.groupMember.findFirst({
        where: { groupId: group.id, userId },
      });

      if (existing && claimMemberId && existing.id !== claimMemberId) {
        throw new AppError(409, 'ALREADY_GROUP_MEMBER', 'Tài khoản của bạn đã có tên trong nhóm.');
      }
      if (existing && existing.status === 'ACTIVE') {
        return reply.status(200).send({
          groupId: group.id,
          memberId: existing.id,
          alreadyMember: true,
        });
      }

      const displayName = user.displayName.trim() || maskVnPhone(user.phone);

      const member = await prisma.$transaction(async (tx) => {
        const claimed = claimMemberId ? await claimPlaceholder(tx, group.id, claimMemberId, { userId, role: 'MEMBER' }, user.displayName.trim()) : null;
        const saved = claimed ?? (existing
          ? await tx.groupMember.update({
              where: { id: existing.id },
              data: {
                status: 'ACTIVE',
                displayName,
                role: existing.role === 'GUEST' ? 'MEMBER' : existing.role,
              },
            })
          : await tx.groupMember.create({
              data: {
                groupId: group.id,
                userId,
                displayName,
                role: 'MEMBER',
                status: 'ACTIVE',
              },
            }));

        await logActivity(tx, {
          groupId: group.id,
          actorMemberId: saved.id,
          type: 'MEMBER_JOINED',
          title: claimed ? `${saved.displayName} đã liên kết tài khoản vào thành viên ${claimed.originalName}` : `${displayName} đã tham gia nhóm`,
          subtitle: group.name,
          metadata: { memberId: saved.id },
        });

        return saved;
      });

      return reply.status(existing ? 200 : 201).send({
        groupId: group.id,
        memberId: member.id,
        alreadyMember: false,
      });
    }
  );
}
