import {
  formatVnd,
  sendReminderSchema,
  type ActivityItemDto,
  type ActivityType,
  type ReminderDto,
} from '@chiane/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { createRequireGroupRole } from '../middleware/rbac';
import { logActivity, parseActivityMetadata } from '../services/activity.service';
import { assertNotArchived } from '../services/balance.service';
import { AppError } from '../utils/errors';

export interface ActivityRoutesDeps {
  prisma: PrismaClient;
  requireAuth: preHandlerHookHandler;
  requireAuthOrGuest: preHandlerHookHandler;
}

const EXPENSE_ACTIVITY_TYPES: ActivityType[] = [
  'EXPENSE_CREATED',
  'EXPENSE_UPDATED',
  'EXPENSE_DELETED',
];

const PAYMENT_ACTIVITY_TYPES: ActivityType[] = [
  'SETTLEMENT_REPORTED',
  'SETTLEMENT_CONFIRMED',
  'SETTLEMENT_REJECTED',
  'REMINDER_SENT',
  'POT_CONTRIBUTED',
];

export async function registerActivityRoutes(
  app: FastifyInstance,
  deps: ActivityRoutesDeps
): Promise<void> {
  const { prisma, requireAuth, requireAuthOrGuest } = deps;

  app.get('/api/v1/activity', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.authUser!.userId;
    const query = (request.query ?? {}) as {
      filter?: string;
      groupId?: string;
      limit?: string;
    };

    const filter = (query.filter ?? 'ALL').toUpperCase();
    const limitRaw = query.limit ? Number.parseInt(query.limit, 10) : 50;
    const take = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;

    const memberships = await prisma.groupMember.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { groupId: true },
    });
    const myGroupIds = memberships.map((m) => m.groupId);

    if (query.groupId) {
      if (!myGroupIds.includes(query.groupId)) {
        throw new AppError(
          403,
          'GROUP_ACCESS_DENIED',
          'Bạn không có quyền xem hoạt động của nhóm này.'
        );
      }
    }

    const targetGroupIds = query.groupId ? [query.groupId] : myGroupIds;
    if (targetGroupIds.length === 0) {
      return reply.status(200).send({ activities: [] });
    }

    const typeFilter =
      filter === 'EXPENSE'
        ? EXPENSE_ACTIVITY_TYPES
        : filter === 'PAYMENT'
          ? PAYMENT_ACTIVITY_TYPES
          : undefined;

    const rows = await prisma.activityLog.findMany({
      where: {
        groupId: { in: targetGroupIds },
        ...(typeFilter ? { type: { in: typeFilter } } : {}),
      },
      include: {
        group: { select: { name: true } },
        actorMember: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    const activities: ActivityItemDto[] = rows.map((row) => ({
      id: row.id,
      groupId: row.groupId,
      groupName: row.group.name,
      actorMemberId: row.actorMemberId,
      actorName: row.actorMember?.displayName ?? null,
      type: row.type as ActivityType,
      title: row.title,
      subtitle: row.subtitle,
      metadata: parseActivityMetadata(row.metadataJson),
      createdAt: row.createdAt.toISOString(),
    }));

    return reply.status(200).send({ activities });
  });

  app.post(
    '/api/v1/groups/:groupId/reminders',
    {
      preHandler: [
        requireAuthOrGuest,
        createRequireGroupRole(prisma, ['ADMIN', 'MEMBER']),
      ],
    },
    async (request, reply) => {
      const membership = request.groupMembership!;
      const input = sendReminderSchema.parse(request.body);

      const group = await assertNotArchived(prisma, membership.groupId);

      if (input.recipientMemberId === membership.memberId) {
        throw new AppError(
          400,
          'INVALID_REMINDER',
          'Bạn không thể tự gửi lời nhắc cho chính mình.'
        );
      }

      const recipient = await prisma.groupMember.findFirst({
        where: {
          id: input.recipientMemberId,
          groupId: membership.groupId,
          status: 'ACTIVE',
        },
        select: { id: true, displayName: true },
      });

      if (!recipient) {
        throw new AppError(
          404,
          'MEMBER_NOT_FOUND',
          'Không tìm thấy thành viên nhận lời nhắc trong nhóm.'
        );
      }

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentReminder = await prisma.paymentReminder.findFirst({
        where: {
          groupId: membership.groupId,
          recipientMemberId: recipient.id,
          sentAt: { gte: twentyFourHoursAgo },
        },
        orderBy: { sentAt: 'desc' },
      });

      if (recentReminder) {
        const nextAllowedAt = new Date(
          recentReminder.sentAt.getTime() + 24 * 60 * 60 * 1000
        ).toISOString();
        throw new AppError(
          429,
          'REMINDER_RATE_LIMITED',
          'Đã gửi lời nhắc cho bạn này trong 24 giờ qua. Nhắc nhẹ thôi để giữ vui nhé!',
          { nextAllowedAt }
        );
      }

      const created = await prisma.$transaction(async (tx) => {
        const reminder = await tx.paymentReminder.create({
          data: {
            groupId: membership.groupId,
            senderMemberId: membership.memberId,
            recipientMemberId: recipient.id,
            amountVnd: input.amountVnd,
            message: input.message,
          },
        });

        await logActivity(tx, {
          groupId: membership.groupId,
          actorMemberId: membership.memberId,
          type: 'REMINDER_SENT',
          title: `${membership.displayName} đã nhắc nhẹ ${recipient.displayName}`,
          subtitle: `${formatVnd(input.amountVnd)} · ${group.name}`,
          metadata: {
            memberId: recipient.id,
            amountVnd: input.amountVnd,
          },
        });

        return reminder;
      });

      const dto: ReminderDto = {
        id: created.id,
        groupId: created.groupId,
        senderMemberId: created.senderMemberId,
        senderName: membership.displayName,
        recipientMemberId: created.recipientMemberId,
        recipientName: recipient.displayName,
        amountVnd: created.amountVnd,
        message: created.message,
        sentAt: created.sentAt.toISOString(),
      };

      return reply.status(201).send({ reminder: dto });
    }
  );
}
