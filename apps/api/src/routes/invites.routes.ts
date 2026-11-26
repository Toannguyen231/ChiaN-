import { claimPlaceholder, isPlaceholder } from '../services/placeholder.service';
import crypto from 'node:crypto';
import {
  claimGuestSchema,
  joinGuestSchema,
  maskVnPhone,
  type GroupCategory,
  type GuestSessionDto,
  type InvitePreviewDto,
} from '@chiane/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { logActivity } from '../services/activity.service';
import { hashGuestToken } from '../services/balance.service';
import { AppError } from '../utils/errors';

export interface InvitesRoutesDeps {
  prisma: PrismaClient;
  requireAuth: preHandlerHookHandler;
}

export async function registerInvitesRoutes(
  app: FastifyInstance,
  deps: InvitesRoutesDeps
): Promise<void> {
  const { prisma, requireAuth } = deps;

  app.get('/api/v1/invites/:inviteCode', async (request, reply) => {
    const { inviteCode } = request.params as { inviteCode: string };
    const normalizedCode = inviteCode.trim().toLowerCase();

    const group = await prisma.group.findFirst({
      where: { inviteCode: normalizedCode },
      include: {
        createdByUser: { select: { displayName: true } },
        members: {
          where: { status: 'ACTIVE' },
          select: { id: true, userId: true, guestTokenHash: true, role: true, displayName: true },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!group) {
      throw new AppError(404, 'INVITE_NOT_FOUND', 'Liên kết mời không hợp lệ hoặc đã thay đổi.');
    }

    const adminMember = group.members.find((m) => m.role === 'ADMIN');
    const inviterName =
      adminMember?.displayName ||
      group.createdByUser?.displayName.trim() ||
      'Hội bạn';

    const preview: InvitePreviewDto = {
      groupId: group.id,
      name: group.name,
      category: group.category as GroupCategory,
      isArchived: group.isArchived,
      memberCount: group.members.length,
      inviterName,
      claimableMembers: group.members.filter(isPlaceholder).map(({ id, displayName }) => ({ id, displayName })),
      inviteCode: group.inviteCode,
    };

    return reply.status(200).send(preview);
  });

  app.post('/api/v1/invites/:inviteCode/join-guest', async (request, reply) => {
    const { inviteCode } = request.params as { inviteCode: string };
    const input = joinGuestSchema.parse(request.body);
    const normalizedCode = inviteCode.trim().toLowerCase();

    const group = await prisma.group.findFirst({
      where: { inviteCode: normalizedCode },
      select: { id: true, name: true, isArchived: true },
    });

    if (!group) {
      throw new AppError(404, 'INVITE_NOT_FOUND', 'Liên kết mời không hợp lệ hoặc đã thay đổi.');
    }

    if (group.isArchived) {
      throw new AppError(400, 'GROUP_ARCHIVED', 'Nhóm này đã được lưu trữ.');
    }

    const rawGuestToken = crypto.randomBytes(32).toString('base64url');
    const guestTokenHash = hashGuestToken(rawGuestToken);

    const member = await prisma.$transaction(async (tx) => {
      const claimed = input.claimMemberId ? await claimPlaceholder(tx, group.id, input.claimMemberId, { guestTokenHash, role: 'GUEST' }, input.displayName) : null;
      const created = claimed ?? await tx.groupMember.create({
        data: {
          groupId: group.id,
          userId: null,
          guestTokenHash,
          displayName: input.displayName!,
          role: 'GUEST',
          status: 'ACTIVE',
        },
      });

      await tx.group.update({
        where: { id: group.id },
        data: { updatedAt: new Date() },
      });

      await logActivity(tx, {
        groupId: group.id,
        actorMemberId: created.id,
        type: 'MEMBER_JOINED',
        title: claimed ? `${created.displayName} đã nhận vai ${claimed.originalName}` : `${created.displayName} đã tham gia với tư cách khách`,
        subtitle: group.name,
        metadata: { memberId: created.id },
      });

      return created;
    });

    const session: GuestSessionDto = {
      guestToken: rawGuestToken,
      groupId: group.id,
      groupName: group.name,
      memberId: member.id,
      displayName: member.displayName,
      role: 'GUEST',
    };

    return reply.status(201).send(session);
  });

  app.post(
    '/api/v1/invites/claim-guest',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.authUser!.userId;
      const input = claimGuestSchema.parse(request.body);
      const guestTokenHash = hashGuestToken(input.guestToken);

      const guestMember = await prisma.groupMember.findUnique({
        where: { guestTokenHash },
      });

      if (!guestMember || guestMember.status !== 'ACTIVE') {
        throw new AppError(
          404,
          'GUEST_SESSION_NOT_FOUND',
          'Không tìm thấy phiên khách hợp lệ để nâng cấp.'
        );
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản.');
      }

      const existingMembership = await prisma.groupMember.findFirst({
        where: { groupId: guestMember.groupId, userId },
      });

      if (existingMembership) {
        if (existingMembership.status !== 'ACTIVE') {
          await prisma.groupMember.update({
            where: { id: existingMembership.id },
            data: { status: 'ACTIVE' },
          });
        }
        await prisma.groupMember.update({
          where: { id: guestMember.id },
          data: { guestTokenHash: null },
        });
        return reply.status(200).send({
          groupId: guestMember.groupId,
          memberId: existingMembership.id,
        });
      }

      const upgraded = await prisma.groupMember.update({
        where: { id: guestMember.id },
        data: {
          userId,
          role: 'MEMBER',
          guestTokenHash: null,
          displayName:
            user.displayName.trim() || guestMember.displayName || maskVnPhone(user.phone),
        },
      });

      return reply.status(200).send({
        groupId: upgraded.groupId,
        memberId: upgraded.id,
      });
    }
  );
}
