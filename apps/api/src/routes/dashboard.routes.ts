import type {
  ActivityItemDto,
  ActivityType,
  DashboardDto,
  GroupMemberRole,
  PendingConfirmationBannerDto,
} from '@chiane/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { parseActivityMetadata } from '../services/activity.service';
import { getGroupSummaryForMember } from '../services/group.service';

export interface DashboardRoutesDeps {
  prisma: PrismaClient;
  requireAuth: preHandlerHookHandler;
}

export async function registerDashboardRoutes(
  app: FastifyInstance,
  deps: DashboardRoutesDeps
): Promise<void> {
  const { prisma, requireAuth } = deps;

  app.get('/api/v1/dashboard', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.authUser!.userId;

    const memberships = await prisma.groupMember.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        group: { isArchived: false },
      },
      include: {
        group: { select: { id: true, updatedAt: true } },
      },
      orderBy: { group: { updatedAt: 'desc' } },
    });

    const recentGroups = await Promise.all(
      memberships.map((m) =>
        getGroupSummaryForMember(prisma, m.groupId, m.id, m.role as GroupMemberRole)
      )
    );

    let totalOwedToYouVnd = 0;
    let totalYouOweVnd = 0;
    for (const group of recentGroups) {
      if (group.myBalanceVnd > 0) {
        totalOwedToYouVnd += group.myBalanceVnd;
      } else if (group.myBalanceVnd < 0) {
        totalYouOweVnd += Math.abs(group.myBalanceVnd);
      }
    }

    const activeGroupIds = memberships.map((m) => m.groupId);
    const activeMemberIds = memberships.map((m) => m.id);

    const [pendingConfirmationsCount, rawActivities] =
      activeGroupIds.length > 0
        ? await Promise.all([
            prisma.settlement.count({
              where: {
                groupId: { in: activeGroupIds },
                toMemberId: { in: activeMemberIds },
                status: 'REPORTED',
              },
            }),
            prisma.activityLog.findMany({
              where: { groupId: { in: activeGroupIds } },
              include: {
                group: { select: { name: true } },
                actorMember: { select: { displayName: true } },
              },
              orderBy: { createdAt: 'desc' },
              take: 5,
            }),
          ])
        : [0, []];

    const recentActivities: ActivityItemDto[] = rawActivities.map((item) => ({
      id: item.id,
      groupId: item.groupId,
      groupName: item.group.name,
      actorMemberId: item.actorMemberId,
      actorName: item.actorMember?.displayName ?? null,
      type: item.type as ActivityType,
      title: item.title,
      subtitle: item.subtitle,
      metadata: parseActivityMetadata(item.metadataJson),
      createdAt: item.createdAt.toISOString(),
    }));

    const pendingConfirmationRows =
      pendingConfirmationsCount > 0 && activeGroupIds.length > 0
        ? await prisma.settlement.findMany({
            where: {
              groupId: { in: activeGroupIds },
              toMemberId: { in: activeMemberIds },
              status: 'REPORTED',
            },
            select: {
              id: true,
              groupId: true,
              fromMemberId: true,
              amountVnd: true,
              reportedAt: true,
              group: { select: { name: true } },
              fromMember: { select: { displayName: true } },
            },
            orderBy: { reportedAt: 'desc' },
            take: 5,
          })
        : [];

    const pendingConfirmations: PendingConfirmationBannerDto[] = pendingConfirmationRows.map(
      (row) => ({
        settlementId: row.id,
        groupId: row.groupId,
        groupName: row.group.name,
        fromMemberId: row.fromMemberId,
        fromName: row.fromMember.displayName,
        amountVnd: row.amountVnd,
        reportedAt: (row.reportedAt ?? new Date()).toISOString(),
      })
    );

    const response: DashboardDto = {
      totalOwedToYouVnd,
      totalYouOweVnd,
      recentGroups,
      pendingConfirmationsCount,
      pendingConfirmations,
      recentActivities,
    };

    return reply.status(200).send(response);
  });
}
