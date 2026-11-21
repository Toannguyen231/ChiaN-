import {
  buildVietQrPayload,
  formatVnd,
  rejectSettlementSchema,
  reportSettlementSchema,
  type BankAccountPreviewDto,
  type GroupBalancesDto,
  type GroupMemberRole,
  type SettlementDto,
  type SettlementMethod,
  type SettlementStatus,
} from '@chiane/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { createRequireGroupRole } from '../middleware/rbac';
import { logActivity } from '../services/activity.service';
import {
  assertNotArchived,
  buildBankPreview,
  computeGroupFinancials,
} from '../services/balance.service';
import { resolveMembershipForGroup } from '../services/expense.service';
import { AppError } from '../utils/errors';

export interface SettlementsRoutesDeps {
  prisma: PrismaClient;
  requireAuthOrGuest: preHandlerHookHandler;
}

const settlementInclude = {
  group: { select: { name: true } },
  fromMember: { select: { displayName: true } },
  toMember: {
    select: {
      displayName: true,
      user: {
        select: {
          bankBin: true,
          bankName: true,
          bankAccountNumber: true,
          bankAccountHolder: true,
        },
      },
    },
  },
} as const;

function parseBankSnapshot(
  rawSnapshot: string | null,
  fallbackUser?: {
    bankBin: string | null;
    bankName: string | null;
    bankAccountNumber: string | null;
    bankAccountHolder: string | null;
  } | null
): BankAccountPreviewDto {
  if (rawSnapshot) {
    try {
      const parsed = JSON.parse(rawSnapshot) as BankAccountPreviewDto;
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
    } catch {
      // Fallback to live user bank fields
    }
  }
  return buildBankPreview(fallbackUser);
}

function serializeSettlement(
  settlement: {
    id: string;
    groupId: string;
    fromMemberId: string;
    toMemberId: string;
    amountVnd: number;
    method: string;
    status: string;
    memo: string | null;
    bankAccountSnapshot: string | null;
    idempotencyKey: string | null;
    reportedAt: Date | null;
    confirmedAt: Date | null;
    rejectedAt: Date | null;
    rejectReason: string | null;
    createdAt: Date;
    group: { name: string };
    fromMember: { displayName: string };
    toMember: {
      displayName: string;
      user: {
        bankBin: string | null;
        bankName: string | null;
        bankAccountNumber: string | null;
        bankAccountHolder: string | null;
      } | null;
    };
  },
  myMemberId: string
): SettlementDto {
  const bankPreview = parseBankSnapshot(
    settlement.bankAccountSnapshot,
    settlement.toMember.user
  );
  const vietQrPayload = bankPreview.hasRealBank
    ? buildVietQrPayload({
        bankBin: bankPreview.bankBin,
        accountNumber: bankPreview.bankAccountNumber,
        amountVnd: settlement.amountVnd,
        memo: settlement.memo ?? undefined,
      })
    : null;

  const isRecipient = settlement.toMemberId === myMemberId;
  const isReported = settlement.status === 'REPORTED';

  return {
    id: settlement.id,
    groupId: settlement.groupId,
    groupName: settlement.group.name,
    fromMemberId: settlement.fromMemberId,
    fromName: settlement.fromMember.displayName,
    toMemberId: settlement.toMemberId,
    toName: settlement.toMember.displayName,
    amountVnd: settlement.amountVnd,
    method: settlement.method as SettlementMethod,
    status: settlement.status as SettlementStatus,
    memo: settlement.memo,
    toBankPreview: bankPreview,
    vietQrPayload,
    idempotencyKey: settlement.idempotencyKey,
    canConfirm: isRecipient && isReported,
    canReject: isRecipient && isReported,
    reportedAt: settlement.reportedAt ? settlement.reportedAt.toISOString() : null,
    confirmedAt: settlement.confirmedAt ? settlement.confirmedAt.toISOString() : null,
    rejectedAt: settlement.rejectedAt ? settlement.rejectedAt.toISOString() : null,
    rejectReason: settlement.rejectReason,
    createdAt: settlement.createdAt.toISOString(),
  };
}

export async function registerSettlementsRoutes(
  app: FastifyInstance,
  deps: SettlementsRoutesDeps
): Promise<void> {
  const { prisma, requireAuthOrGuest } = deps;

  app.get(
    '/api/v1/groups/:groupId/balances',
    {
      preHandler: [
        requireAuthOrGuest,
        createRequireGroupRole(prisma, ['ADMIN', 'MEMBER', 'GUEST']),
      ],
    },
    async (request, reply) => {
      const membership = request.groupMembership!;

      const [group, activeMembers, financials, pendingRaw] = await Promise.all([
        prisma.group.findUnique({
          where: { id: membership.groupId },
          select: { name: true },
        }),
        prisma.groupMember.findMany({
          where: { groupId: membership.groupId, status: 'ACTIVE' },
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
          orderBy: { joinedAt: 'asc' },
        }),
        computeGroupFinancials(prisma, membership.groupId),
        prisma.settlement.findMany({
          where: { groupId: membership.groupId, status: 'REPORTED' },
          include: settlementInclude,
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      if (!group) {
        throw new AppError(404, 'GROUP_NOT_FOUND', 'Không tìm thấy nhóm.');
      }

      const memberLookup = new Map(activeMembers.map((m) => [m.id, m]));

      const memberBalances = activeMembers.map((m) => ({
        memberId: m.id,
        displayName: m.displayName,
        role: m.role as GroupMemberRole,
        netBalanceVnd: financials.balancesMap.get(m.id) ?? 0,
        isMe: m.id === membership.memberId,
        bankPreview: buildBankPreview(m.user),
      }));

      const suggestedTransfers = financials.suggestedTransfers.map((t) => {
        const from = memberLookup.get(t.fromMemberId);
        const to = memberLookup.get(t.toMemberId);
        return {
          fromMemberId: t.fromMemberId,
          fromName: from?.displayName ?? 'Thành viên',
          toMemberId: t.toMemberId,
          toName: to?.displayName ?? 'Thành viên',
          amountVnd: t.amountVnd,
          isFromMe: t.fromMemberId === membership.memberId,
          isToMe: t.toMemberId === membership.memberId,
          toBankPreview: buildBankPreview(to?.user),
        };
      });

      const response: GroupBalancesDto = {
        groupId: membership.groupId,
        groupName: group.name,
        myMemberId: membership.memberId,
        myNetBalanceVnd: financials.balancesMap.get(membership.memberId) ?? 0,
        memberBalances,
        suggestedTransfers,
        pendingSettlements: pendingRaw.map((s) =>
          serializeSettlement(s, membership.memberId)
        ),
      };

      return reply.status(200).send(response);
    }
  );

  app.get(
    '/api/v1/groups/:groupId/settlements',
    {
      preHandler: [
        requireAuthOrGuest,
        createRequireGroupRole(prisma, ['ADMIN', 'MEMBER', 'GUEST']),
      ],
    },
    async (request, reply) => {
      const membership = request.groupMembership!;
      const query = (request.query ?? {}) as { status?: string };
      const statusFilter = query.status?.trim().toUpperCase();

      const rows = await prisma.settlement.findMany({
        where: {
          groupId: membership.groupId,
          ...(statusFilter &&
          ['PENDING', 'REPORTED', 'CONFIRMED', 'REJECTED'].includes(statusFilter)
            ? { status: statusFilter }
            : {}),
        },
        include: settlementInclude,
        orderBy: { createdAt: 'desc' },
      });

      return reply.status(200).send({
        settlements: rows.map((r) => serializeSettlement(r, membership.memberId)),
      });
    }
  );

  app.get(
    '/api/v1/settlements/:settlementId',
    { preHandler: requireAuthOrGuest },
    async (request, reply) => {
      const { settlementId } = request.params as { settlementId: string };

      const settlement = await prisma.settlement.findUnique({
        where: { id: settlementId },
        include: settlementInclude,
      });

      if (!settlement) {
        throw new AppError(404, 'SETTLEMENT_NOT_FOUND', 'Không tìm thấy khoản thanh toán.');
      }

      const membership = await resolveMembershipForGroup(
        prisma,
        request,
        settlement.groupId
      );
      const financials = await computeGroupFinancials(prisma, settlement.groupId);

      return reply.status(200).send({
        settlement: serializeSettlement(settlement, membership.id),
        myNewGroupBalanceVnd: financials.balancesMap.get(membership.id) ?? 0,
      });
    }
  );

  app.post(
    '/api/v1/groups/:groupId/settlements/report',
    {
      preHandler: [
        requireAuthOrGuest,
        createRequireGroupRole(prisma, ['ADMIN', 'MEMBER', 'GUEST']),
      ],
    },
    async (request, reply) => {
      const membership = request.groupMembership!;
      const input = reportSettlementSchema.parse(request.body);

      await assertNotArchived(prisma, membership.groupId);

      if (input.idempotencyKey) {
        const existing = await prisma.settlement.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: settlementInclude,
        });
        if (existing) {
          if (existing.groupId !== membership.groupId) {
            throw new AppError(
              409,
              'IDEMPOTENCY_CONFLICT',
              'Mã giao dịch thuộc về một nhóm khác.'
            );
          }
          return reply.status(200).send({
            settlement: serializeSettlement(existing, membership.memberId),
          });
        }
      }

      if (input.fromMemberId === input.toMemberId) {
        throw new AppError(
          400,
          'INVALID_SETTLEMENT',
          'Người trả và người nhận không thể là cùng một người.'
        );
      }

      if (input.fromMemberId !== membership.memberId && membership.role !== 'ADMIN') {
        throw new AppError(
          403,
          'INSUFFICIENT_ROLE',
          'Bạn chỉ có thể báo thanh toán cho khoản của chính mình.'
        );
      }

      const [fromMember, toMember] = await Promise.all([
        prisma.groupMember.findFirst({
          where: {
            id: input.fromMemberId,
            groupId: membership.groupId,
            status: 'ACTIVE',
          },
        }),
        prisma.groupMember.findFirst({
          where: {
            id: input.toMemberId,
            groupId: membership.groupId,
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
        }),
      ]);

      if (!fromMember || !toMember) {
        throw new AppError(
          400,
          'INVALID_PARTICIPANT',
          'Thành viên thanh toán không hợp lệ trong nhóm.'
        );
      }

      const recentDuplicate = await prisma.settlement.findFirst({
        where: {
          groupId: membership.groupId,
          fromMemberId: input.fromMemberId,
          toMemberId: input.toMemberId,
          amountVnd: input.amountVnd,
          status: 'REPORTED',
          createdAt: { gte: new Date(Date.now() - 120_000) },
        },
      });

      if (recentDuplicate) {
        throw new AppError(
          409,
          'DUPLICATE_PENDING_SETTLEMENT',
          'Bạn vừa báo chuyển khoản số tiền này và đang chờ người nhận xác nhận.'
        );
      }

      const bankPreview = buildBankPreview(toMember.user);
      const bankSnapshotJson = JSON.stringify(bankPreview);

      const created = await prisma.$transaction(async (tx) => {
        const record = await tx.settlement.create({
          data: {
            groupId: membership.groupId,
            fromMemberId: input.fromMemberId,
            toMemberId: input.toMemberId,
            amountVnd: input.amountVnd,
            method: input.method,
            status: 'REPORTED',
            memo: input.memo ?? null,
            bankAccountSnapshot: bankSnapshotJson,
            idempotencyKey: input.idempotencyKey ?? null,
            reportedAt: new Date(),
          },
          include: settlementInclude,
        });

        await tx.group.update({
          where: { id: membership.groupId },
          data: { updatedAt: new Date() },
        });

        await logActivity(tx, {
          groupId: membership.groupId,
          actorMemberId: membership.memberId,
          type: 'SETTLEMENT_REPORTED',
          title: `${fromMember.displayName} đã báo chuyển tiền`,
          subtitle: `${formatVnd(input.amountVnd)} cho ${toMember.displayName} · Chờ xác nhận`,
          metadata: {
            settlementId: record.id,
            amountVnd: record.amountVnd,
            status: 'REPORTED',
          },
        });

        return record;
      });

      return reply.status(201).send({
        settlement: serializeSettlement(created, membership.memberId),
      });
    }
  );

  app.post(
    '/api/v1/settlements/:settlementId/confirm',
    { preHandler: requireAuthOrGuest },
    async (request, reply) => {
      const { settlementId } = request.params as { settlementId: string };

      const existing = await prisma.settlement.findUnique({
        where: { id: settlementId },
        include: settlementInclude,
      });

      if (!existing) {
        throw new AppError(404, 'SETTLEMENT_NOT_FOUND', 'Không tìm thấy khoản thanh toán.');
      }

      const membership = await resolveMembershipForGroup(
        prisma,
        request,
        existing.groupId
      );
      await assertNotArchived(prisma, existing.groupId);

      if (membership.id !== existing.toMemberId) {
        throw new AppError(
          403,
          'ONLY_RECIPIENT_CAN_CONFIRM',
          'Chỉ người nhận tiền mới có thể xác nhận đã nhận đủ.'
        );
      }

      if (existing.status !== 'REPORTED') {
        throw new AppError(
          400,
          'INVALID_SETTLEMENT_STATE',
          'Khoản thanh toán này đã được xử lý trước đó.'
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const record = await tx.settlement.update({
          where: { id: existing.id },
          data: {
            status: 'CONFIRMED',
            confirmedAt: new Date(),
          },
          include: settlementInclude,
        });

        await tx.group.update({
          where: { id: existing.groupId },
          data: { updatedAt: new Date() },
        });

        await logActivity(tx, {
          groupId: existing.groupId,
          actorMemberId: membership.id,
          type: 'SETTLEMENT_CONFIRMED',
          title: `${existing.toMember.displayName} đã xác nhận nhận tiền`,
          subtitle: `${formatVnd(existing.amountVnd)} từ ${existing.fromMember.displayName}`,
          metadata: {
            settlementId: record.id,
            amountVnd: record.amountVnd,
            status: 'CONFIRMED',
          },
        });

        return record;
      });

      const financials = await computeGroupFinancials(prisma, existing.groupId);

      return reply.status(200).send({
        settlement: serializeSettlement(updated, membership.id),
        updatedBalances: financials.memberBalances,
        myNewGroupBalanceVnd: financials.balancesMap.get(membership.id) ?? 0,
      });
    }
  );

  app.post(
    '/api/v1/settlements/:settlementId/reject',
    { preHandler: requireAuthOrGuest },
    async (request, reply) => {
      const { settlementId } = request.params as { settlementId: string };
      const input = rejectSettlementSchema.parse(request.body ?? {});

      const existing = await prisma.settlement.findUnique({
        where: { id: settlementId },
        include: settlementInclude,
      });

      if (!existing) {
        throw new AppError(404, 'SETTLEMENT_NOT_FOUND', 'Không tìm thấy khoản thanh toán.');
      }

      const membership = await resolveMembershipForGroup(
        prisma,
        request,
        existing.groupId
      );
      await assertNotArchived(prisma, existing.groupId);

      if (membership.id !== existing.toMemberId) {
        throw new AppError(
          403,
          'ONLY_RECIPIENT_CAN_CONFIRM',
          'Chỉ người nhận mới có quyền từ chối xác nhận.'
        );
      }

      if (existing.status !== 'REPORTED') {
        throw new AppError(
          400,
          'INVALID_SETTLEMENT_STATE',
          'Khoản thanh toán này đã được xử lý trước đó.'
        );
      }

      const reason = input.reason?.trim() || 'Chưa nhận được tiền';

      const updated = await prisma.$transaction(async (tx) => {
        const record = await tx.settlement.update({
          where: { id: existing.id },
          data: {
            status: 'REJECTED',
            rejectedAt: new Date(),
            rejectReason: reason,
          },
          include: settlementInclude,
        });

        await tx.group.update({
          where: { id: existing.groupId },
          data: { updatedAt: new Date() },
        });

        await logActivity(tx, {
          groupId: existing.groupId,
          actorMemberId: membership.id,
          type: 'SETTLEMENT_REJECTED',
          title: `${existing.toMember.displayName} báo chưa nhận được tiền`,
          subtitle: `${formatVnd(existing.amountVnd)} từ ${existing.fromMember.displayName} · ${reason}`,
          metadata: {
            settlementId: record.id,
            amountVnd: record.amountVnd,
            status: 'REJECTED',
          },
        });

        return record;
      });

      return reply.status(200).send({
        settlement: serializeSettlement(updated, membership.id),
      });
    }
  );
}
