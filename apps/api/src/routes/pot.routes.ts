import {
  contributePotSchema,
  formatVnd,
  type GroupPotContributionDto,
  type GroupPotDto,
  type GroupPotMemberSummaryDto,
} from '@chiane/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { createRequireGroupRole } from '../middleware/rbac';
import { logActivity } from '../services/activity.service';
import { assertNotArchived } from '../services/balance.service';
import { AppError } from '../utils/errors';

export interface PotRoutesDeps {
  prisma: PrismaClient;
  requireAuthOrGuest: preHandlerHookHandler;
}

export async function buildGroupPotDto(
  prisma: PrismaClient,
  groupId: string,
  myMemberId: string
): Promise<GroupPotDto> {
  const [activeMembers, contributions, potExpenses] = await Promise.all([
    prisma.groupMember.findMany({
      where: { groupId, status: 'ACTIVE' },
      select: { id: true, displayName: true },
      orderBy: { joinedAt: 'asc' },
    }),
    prisma.groupPotContribution.findMany({
      where: { groupId },
      include: {
        member: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.expense.findMany({
      where: { groupId, deletedAt: null, isPaidFromPot: true },
      select: {
        id: true,
        amountVnd: true,
        splits: {
          select: {
            memberId: true,
            amountVnd: true,
            member: { select: { displayName: true } },
          },
        },
      },
    }),
  ]);

  const memberNameMap = new Map<string, string>();
  const contributedByMember = new Map<string, number>();
  const consumedByMember = new Map<string, number>();

  for (const m of activeMembers) {
    memberNameMap.set(m.id, m.displayName);
    contributedByMember.set(m.id, 0);
    consumedByMember.set(m.id, 0);
  }

  let totalContributedVnd = 0;
  const serializedContributions: GroupPotContributionDto[] = contributions.map((c) => {
    totalContributedVnd += c.amountVnd;
    if (!memberNameMap.has(c.memberId)) {
      memberNameMap.set(c.memberId, c.member.displayName);
    }
    contributedByMember.set(
      c.memberId,
      (contributedByMember.get(c.memberId) ?? 0) + c.amountVnd
    );
    return {
      id: c.id,
      groupId: c.groupId,
      memberId: c.memberId,
      memberName: c.member.displayName,
      amountVnd: c.amountVnd,
      note: c.note,
      createdAt: c.createdAt.toISOString(),
    };
  });

  let totalSpentFromPotVnd = 0;
  for (const exp of potExpenses) {
    totalSpentFromPotVnd += exp.amountVnd;
    for (const s of exp.splits) {
      if (!memberNameMap.has(s.memberId)) {
        memberNameMap.set(s.memberId, s.member.displayName);
      }
      consumedByMember.set(
        s.memberId,
        (consumedByMember.get(s.memberId) ?? 0) + s.amountVnd
      );
    }
  }

  const memberSummaries: GroupPotMemberSummaryDto[] = Array.from(
    memberNameMap.entries()
  ).map(([memberId, displayName]) => {
    const contributedVnd = contributedByMember.get(memberId) ?? 0;
    const consumedFromPotVnd = consumedByMember.get(memberId) ?? 0;
    return {
      memberId,
      displayName,
      isMe: memberId === myMemberId,
      contributedVnd,
      consumedFromPotVnd,
      netRefundVnd: contributedVnd - consumedFromPotVnd,
    };
  });

  return {
    groupId,
    totalContributedVnd,
    totalSpentFromPotVnd,
    remainingPotVnd: totalContributedVnd - totalSpentFromPotVnd,
    contributions: serializedContributions,
    memberSummaries,
  };
}

export async function registerPotRoutes(
  app: FastifyInstance,
  deps: PotRoutesDeps
): Promise<void> {
  const { prisma, requireAuthOrGuest } = deps;

  app.get(
    '/api/v1/groups/:groupId/pot',
    {
      preHandler: [
        requireAuthOrGuest,
        createRequireGroupRole(prisma, ['ADMIN', 'MEMBER', 'GUEST']),
      ],
    },
    async (request, reply) => {
      const membership = request.groupMembership!;
      const pot = await buildGroupPotDto(prisma, membership.groupId, membership.memberId);
      return reply.status(200).send(pot);
    }
  );

  app.post(
    '/api/v1/groups/:groupId/pot/contribute',
    {
      preHandler: [
        requireAuthOrGuest,
        createRequireGroupRole(prisma, ['ADMIN', 'MEMBER', 'GUEST']),
      ],
    },
    async (request, reply) => {
      const membership = request.groupMembership!;
      await assertNotArchived(prisma, membership.groupId);

      const input = contributePotSchema.parse(request.body);
      const targetMemberId = input.memberId ?? membership.memberId;

      if (membership.role === 'GUEST' && targetMemberId !== membership.memberId) {
        throw new AppError(
          403,
          'INSUFFICIENT_ROLE',
          'Khách chỉ có thể ghi nhận phần đóng góp quỹ của chính mình.'
        );
      }

      const targetMember = await prisma.groupMember.findFirst({
        where: {
          id: targetMemberId,
          groupId: membership.groupId,
          status: 'ACTIVE',
        },
        select: { id: true, displayName: true },
      });

      if (!targetMember) {
        throw new AppError(
          400,
          'INVALID_MEMBER',
          'Thành viên đóng góp quỹ phải đang hoạt động trong nhóm.'
        );
      }

      const created = await prisma.$transaction(async (tx) => {
        const contribution = await tx.groupPotContribution.create({
          data: {
            groupId: membership.groupId,
            memberId: targetMember.id,
            amountVnd: input.amountVnd,
            note: input.note ?? null,
          },
        });

        await tx.group.update({
          where: { id: membership.groupId },
          data: { updatedAt: new Date() },
        });

        await logActivity(tx, {
          groupId: membership.groupId,
          actorMemberId: membership.memberId,
          type: 'POT_CONTRIBUTED',
          title: `${targetMember.displayName} đã góp quỹ nhóm`,
          subtitle: input.note?.trim()
            ? `${formatVnd(input.amountVnd)} · ${input.note.trim()}`
            : formatVnd(input.amountVnd),
          metadata: {
            memberId: targetMember.id,
            amountVnd: input.amountVnd,
          },
        });

        return contribution;
      });

      const pot = await buildGroupPotDto(prisma, membership.groupId, membership.memberId);

      return reply.status(201).send({
        contribution: {
          id: created.id,
          groupId: created.groupId,
          memberId: created.memberId,
          memberName: targetMember.displayName,
          amountVnd: created.amountVnd,
          note: created.note,
          createdAt: created.createdAt.toISOString(),
        },
        pot,
      });
    }
  );
}
