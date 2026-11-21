import {
  createExpenseSchema,
  formatVnd,
  updateExpenseSchema,
  type ExpenseCategory,
  type SplitMethod,
} from '@chiane/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { createRequireGroupRole } from '../middleware/rbac';
import { logActivity } from '../services/activity.service';
import { assertNotArchived } from '../services/balance.service';
import {
  computeCanonicalSplits,
  createExpenseInGroup,
  expenseInclude,
  resolveMembershipForGroup,
} from '../services/expense.service';
import { serializeExpenseRecord } from '../services/group.service';
import { AppError } from '../utils/errors';

export interface ExpensesRoutesDeps {
  prisma: PrismaClient;
  requireAuthOrGuest: preHandlerHookHandler;
}

export async function registerExpensesRoutes(
  app: FastifyInstance,
  deps: ExpensesRoutesDeps
): Promise<void> {
  const { prisma, requireAuthOrGuest } = deps;

  app.get(
    '/api/v1/groups/:groupId/expenses',
    {
      preHandler: [
        requireAuthOrGuest,
        createRequireGroupRole(prisma, ['ADMIN', 'MEMBER', 'GUEST']),
      ],
    },
    async (request, reply) => {
      const membership = request.groupMembership!;
      const expenses = await prisma.expense.findMany({
        where: { groupId: membership.groupId, deletedAt: null },
        include: expenseInclude,
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
      });

      return reply.status(200).send({
        expenses: expenses.map((e) => serializeExpenseRecord(e, membership.memberId)),
      });
    }
  );

  app.post(
    '/api/v1/groups/:groupId/expenses',
    {
      preHandler: [
        requireAuthOrGuest,
        createRequireGroupRole(prisma, ['ADMIN', 'MEMBER', 'GUEST']),
      ],
    },
    async (request, reply) => {
      const membership = request.groupMembership!;
      const input = createExpenseSchema.parse(request.body);

      const result = await createExpenseInGroup(prisma, {
        groupId: membership.groupId,
        actorMemberId: membership.memberId,
        input,
      });

      return reply
        .status(result.created ? 201 : 200)
        .send({ expense: result.expense });
    }
  );

  app.get(
    '/api/v1/expenses/:expenseId',
    { preHandler: requireAuthOrGuest },
    async (request, reply) => {
      const { expenseId } = request.params as { expenseId: string };
      const expense = await prisma.expense.findUnique({
        where: { id: expenseId },
        include: {
          ...expenseInclude,
          group: { select: { name: true, isArchived: true } },
        },
      });

      if (!expense || expense.deletedAt) {
        throw new AppError(404, 'EXPENSE_NOT_FOUND', 'Không tìm thấy khoản chi.');
      }

      const membership = await resolveMembershipForGroup(prisma, request, expense.groupId);
      const canModifyAsGuest =
        membership.role !== 'GUEST' || expense.createdByMemberId === membership.id;
      const canEdit = !expense.group.isArchived && canModifyAsGuest;
      const canDelete =
        !expense.group.isArchived &&
        (membership.role === 'ADMIN' || expense.createdByMemberId === membership.id);

      return reply.status(200).send({
        expense: serializeExpenseRecord(expense, membership.id),
        groupName: expense.group.name,
        isArchived: expense.group.isArchived,
        myMemberId: membership.id,
        myRole: membership.role,
        canEdit,
        canDelete,
      });
    }
  );

  app.patch(
    '/api/v1/expenses/:expenseId',
    { preHandler: requireAuthOrGuest },
    async (request, reply) => {
      const { expenseId } = request.params as { expenseId: string };
      const input = updateExpenseSchema.parse(request.body);

      const existing = await prisma.expense.findUnique({
        where: { id: expenseId },
        include: expenseInclude,
      });

      if (!existing || existing.deletedAt) {
        throw new AppError(404, 'EXPENSE_NOT_FOUND', 'Không tìm thấy khoản chi.');
      }

      const membership = await resolveMembershipForGroup(prisma, request, existing.groupId);
      await assertNotArchived(prisma, existing.groupId);

      if (membership.role === 'GUEST' && existing.createdByMemberId !== membership.id) {
        throw new AppError(
          403,
          'INSUFFICIENT_ROLE',
          'Khách chỉ có thể chỉnh sửa khoản chi do chính mình thêm.'
        );
      }

      const activeMembers = await prisma.groupMember.findMany({
        where: { groupId: existing.groupId, status: 'ACTIVE' },
        select: { id: true },
      });
      const activeIds = new Set(activeMembers.map((m) => m.id));

      const nextAmount = input.amountVnd ?? existing.amountVnd;
      const nextSplitMethod = (input.splitMethod ?? existing.splitMethod) as SplitMethod;
      const nextPaidBy = input.paidByMemberId ?? existing.paidByMemberId;

      if (!activeIds.has(nextPaidBy)) {
        throw new AppError(
          400,
          'INVALID_PAYER',
          'Người trả tiền phải là thành viên hoạt động trong nhóm.'
        );
      }

      const nextSplitsInput =
        input.splits ??
        existing.splits.map((s) => ({
          memberId: s.memberId,
          amountVnd: s.amountVnd,
          percentageBps: s.percentageBps ?? undefined,
        }));

      const computedSplits = computeCanonicalSplits(
        nextAmount,
        nextSplitMethod,
        nextSplitsInput,
        activeIds
      );

      const updated = await prisma.$transaction(async (tx) => {
        await tx.expenseSplit.deleteMany({ where: { expenseId: existing.id } });

        await tx.expense.update({
          where: { id: existing.id },
          data: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            amountVnd: nextAmount,
            ...(input.category !== undefined ? { category: input.category } : {}),
            splitMethod: nextSplitMethod,
            paidByMemberId: nextPaidBy,
            ...(input.expenseDate !== undefined
              ? { expenseDate: new Date(input.expenseDate) }
              : {}),
            ...(input.note !== undefined ? { note: input.note } : {}),
            ...(input.receiptImageUrl !== undefined
              ? { receiptImageUrl: input.receiptImageUrl }
              : {}),
            ...(input.isPaidFromPot !== undefined
              ? { isPaidFromPot: input.isPaidFromPot }
              : {}),
            splits: {
              create: computedSplits.map((s) => ({
                memberId: s.memberId,
                amountVnd: s.amountVnd,
                percentageBps: s.percentageBps,
              })),
            },
          },
        });

        await tx.group.update({
          where: { id: existing.groupId },
          data: { updatedAt: new Date() },
        });

        const reloaded = await tx.expense.findUniqueOrThrow({
          where: { id: existing.id },
          include: expenseInclude,
        });

        await logActivity(tx, {
          groupId: existing.groupId,
          actorMemberId: membership.id,
          type: 'EXPENSE_UPDATED',
          title: `${membership.displayName} đã sửa ${reloaded.title}`,
          subtitle: `${formatVnd(reloaded.amountVnd)} · ${computedSplits.length} người`,
          metadata: {
            expenseId: reloaded.id,
            amountVnd: reloaded.amountVnd,
            category: reloaded.category as ExpenseCategory,
          },
        });

        return reloaded;
      });

      return reply.status(200).send({
        expense: serializeExpenseRecord(updated, membership.id),
      });
    }
  );

  app.delete(
    '/api/v1/expenses/:expenseId',
    { preHandler: requireAuthOrGuest },
    async (request, reply) => {
      const { expenseId } = request.params as { expenseId: string };

      const existing = await prisma.expense.findUnique({
        where: { id: expenseId },
        select: {
          id: true,
          groupId: true,
          title: true,
          amountVnd: true,
          category: true,
          createdByMemberId: true,
          deletedAt: true,
        },
      });

      if (!existing || existing.deletedAt) {
        throw new AppError(404, 'EXPENSE_NOT_FOUND', 'Không tìm thấy khoản chi.');
      }

      const membership = await resolveMembershipForGroup(prisma, request, existing.groupId);
      await assertNotArchived(prisma, existing.groupId);

      if (membership.role !== 'ADMIN' && existing.createdByMemberId !== membership.id) {
        throw new AppError(
          403,
          'INSUFFICIENT_ROLE',
          'Chỉ trưởng nhóm hoặc người thêm khoản chi mới có quyền xóa.'
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.expense.update({
          where: { id: existing.id },
          data: { deletedAt: new Date() },
        });

        await tx.group.update({
          where: { id: existing.groupId },
          data: { updatedAt: new Date() },
        });

        await logActivity(tx, {
          groupId: existing.groupId,
          actorMemberId: membership.id,
          type: 'EXPENSE_DELETED',
          title: `${membership.displayName} đã xóa ${existing.title}`,
          subtitle: `${formatVnd(existing.amountVnd)}`,
          metadata: {
            expenseId: existing.id,
            amountVnd: existing.amountVnd,
            category: existing.category as ExpenseCategory,
          },
        });
      });

      return reply.status(200).send({ success: true });
    }
  );
}
