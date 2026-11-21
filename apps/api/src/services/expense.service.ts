import {
  calculateEqualSplit,
  calculatePercentageSplit,
  formatVnd,
  validateExactSplit,
  type ExpenseCategory,
  type ExpenseDto,
  type SplitMethod,
} from '@chiane/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { logActivity } from './activity.service';
import { assertNotArchived } from './balance.service';
import { serializeExpenseRecord } from './group.service';
import { AppError } from '../utils/errors';

export const expenseInclude = {
  paidByMember: { select: { displayName: true } },
  createdByMember: { select: { displayName: true } },
  splits: {
    include: {
      member: { select: { displayName: true } },
    },
  },
} as const;

export interface SplitInputItem {
  memberId: string;
  amountVnd?: number;
  percentageBps?: number;
}

export interface ComputedSplitRow {
  memberId: string;
  amountVnd: number;
  percentageBps: number | null;
}

export function computeCanonicalSplits(
  amountVnd: number,
  splitMethod: SplitMethod,
  entries: SplitInputItem[],
  activeMemberIds: Set<string>
): ComputedSplitRow[] {
  if (entries.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Cần ít nhất 1 người tham gia chia tiền.');
  }

  for (const item of entries) {
    if (!activeMemberIds.has(item.memberId)) {
      throw new AppError(
        400,
        'INVALID_PARTICIPANT',
        'Thành viên tham gia chia tiền không hoạt động trong nhóm.'
      );
    }
  }

  if (splitMethod === 'EQUAL') {
    const shares = calculateEqualSplit(
      amountVnd,
      entries.map((e) => e.memberId)
    );
    return shares.map((s) => ({
      memberId: s.memberId,
      amountVnd: s.amountVnd,
      percentageBps: null,
    }));
  }

  if (splitMethod === 'EXACT') {
    const exactEntries = entries.map((e) => {
      if (typeof e.amountVnd !== 'number' || !Number.isInteger(e.amountVnd) || e.amountVnd < 0) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Số tiền chia tùy chỉnh không hợp lệ.');
      }
      return { memberId: e.memberId, amountVnd: e.amountVnd };
    });

    const validation = validateExactSplit(amountVnd, exactEntries);
    if (!validation.valid) {
      throw new AppError(
        400,
        'SPLIT_MISMATCH',
        'Tổng các phần chia chưa khớp với số tiền khoản chi.',
        {
          diffVnd: validation.diffVnd,
          allocatedVnd: validation.allocatedVnd,
        }
      );
    }

    return exactEntries.map((s) => ({
      memberId: s.memberId,
      amountVnd: s.amountVnd,
      percentageBps: null,
    }));
  }

  // PERCENTAGE
  const pctEntries = entries.map((e) => {
    if (
      typeof e.percentageBps !== 'number' ||
      !Number.isInteger(e.percentageBps) ||
      e.percentageBps < 0 ||
      e.percentageBps > 10000
    ) {
      throw new AppError(400, 'INVALID_PERCENTAGE_SUM', 'Tỷ lệ phần trăm chia không hợp lệ.');
    }
    return { memberId: e.memberId, percentageBps: e.percentageBps };
  });

  try {
    const shares = calculatePercentageSplit(amountVnd, pctEntries);
    return shares.map((s) => ({
      memberId: s.memberId,
      amountVnd: s.amountVnd,
      percentageBps: s.percentageBps,
    }));
  } catch (err) {
    throw new AppError(
      400,
      'INVALID_PERCENTAGE_SUM',
      err instanceof Error ? err.message : 'Tổng phần trăm phải bằng 100%.'
    );
  }
}

export async function resolveMembershipForGroup(
  prisma: PrismaClient,
  request: FastifyRequest,
  groupId: string
) {
  if (request.authUser?.userId) {
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId,
        userId: request.authUser.userId,
        status: 'ACTIVE',
      },
    });
    if (!membership) {
      throw new AppError(403, 'GROUP_ACCESS_DENIED', 'Bạn không có quyền truy cập nhóm này.');
    }
    return membership;
  }

  if (request.guestMember) {
    if (request.guestMember.groupId !== groupId) {
      throw new AppError(403, 'GROUP_ACCESS_DENIED', 'Bạn không có quyền truy cập nhóm này.');
    }
    const membership = await prisma.groupMember.findFirst({
      where: {
        id: request.guestMember.memberId,
        groupId,
        status: 'ACTIVE',
      },
    });
    if (!membership) {
      throw new AppError(403, 'GROUP_ACCESS_DENIED', 'Bạn không còn quyền truy cập nhóm này.');
    }
    return membership;
  }

  throw new AppError(401, 'UNAUTHORIZED', 'Bạn cần đăng nhập để tiếp tục.');
}

export interface CreateExpenseParams {
  groupId: string;
  actorMemberId: string;
  input: {
    title: string;
    amountVnd: number;
    category: ExpenseCategory;
    splitMethod: SplitMethod;
    paidByMemberId: string;
    expenseDate?: string;
    note?: string;
    receiptImageUrl?: string | null;
    isPaidFromPot?: boolean;
    clientMutationId?: string;
    splits: SplitInputItem[];
  };
}

export async function createExpenseInGroup(
  prisma: PrismaClient,
  params: CreateExpenseParams
): Promise<{ expense: ExpenseDto; created: boolean }> {
  const { groupId, actorMemberId, input } = params;

  await assertNotArchived(prisma, groupId);

  if (input.clientMutationId) {
    const existing = await prisma.expense.findFirst({
      where: { clientMutationId: input.clientMutationId },
      include: expenseInclude,
    });
    if (existing) {
      if (existing.groupId !== groupId) {
        throw new AppError(
          409,
          'MUTATION_ID_CONFLICT',
          'Mã đồng bộ khoản chi thuộc về một nhóm khác.'
        );
      }
      return {
        expense: serializeExpenseRecord(existing, actorMemberId),
        created: false,
      };
    }
  }

  const activeMembers = await prisma.groupMember.findMany({
    where: { groupId, status: 'ACTIVE' },
    select: { id: true, displayName: true },
  });

  const activeMap = new Map(activeMembers.map((m) => [m.id, m.displayName]));
  const activeIds = new Set(activeMembers.map((m) => m.id));

  if (!activeIds.has(input.paidByMemberId)) {
    throw new AppError(400, 'INVALID_PAYER', 'Người trả tiền phải là thành viên hoạt động trong nhóm.');
  }

  const computedSplits = computeCanonicalSplits(
    input.amountVnd,
    input.splitMethod,
    input.splits,
    activeIds
  );

  const payerName = activeMap.get(input.paidByMemberId) ?? 'Thành viên';
  const expenseDate = input.expenseDate ? new Date(input.expenseDate) : new Date();

  const created = await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        groupId,
        title: input.title,
        amountVnd: input.amountVnd,
        category: input.category,
        splitMethod: input.splitMethod,
        paidByMemberId: input.paidByMemberId,
        createdByMemberId: actorMemberId,
        expenseDate,
        note: input.note ?? null,
        receiptImageUrl: input.receiptImageUrl ?? null,
        isPaidFromPot: Boolean(input.isPaidFromPot),
        clientMutationId: input.clientMutationId ?? null,
        splits: {
          create: computedSplits.map((s) => ({
            memberId: s.memberId,
            amountVnd: s.amountVnd,
            percentageBps: s.percentageBps,
          })),
        },
      },
      include: expenseInclude,
    });

    await tx.group.update({
      where: { id: groupId },
      data: { updatedAt: new Date() },
    });

    await logActivity(tx, {
      groupId,
      actorMemberId,
      type: 'EXPENSE_CREATED',
      title: expense.isPaidFromPot
        ? `Quỹ chung đã chi ${expense.title}`
        : `${payerName} đã trả ${expense.title}`,
      subtitle: `${formatVnd(expense.amountVnd)} · ${computedSplits.length} người`,
      metadata: {
        expenseId: expense.id,
        amountVnd: expense.amountVnd,
        category: expense.category as ExpenseCategory,
      },
    });

    return expense;
  });

  return {
    expense: serializeExpenseRecord(created, actorMemberId),
    created: true,
  };
}
