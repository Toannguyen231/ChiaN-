import crypto from 'node:crypto';
import type { BankAccountPreviewDto } from '@chiane/shared';
import {
  calculateNetBalances,
  maskBankAccount,
  optimizeSettlements,
  type MemberBalance,
  type SettlementStatus,
  type SuggestedTransfer,
} from '@chiane/shared';
import type { Prisma, PrismaClient, User } from '@prisma/client';
import { AppError } from '../utils/errors';

export type DbClient = PrismaClient | Prisma.TransactionClient;

export function hashGuestToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function buildBankPreview(
  user?: Pick<
    User,
    'bankBin' | 'bankName' | 'bankAccountNumber' | 'bankAccountHolder'
  > | null
): BankAccountPreviewDto {
  const bankBin = user?.bankBin ?? null;
  const bankName = user?.bankName ?? null;
  const bankAccountNumber = user?.bankAccountNumber ?? null;
  const bankAccountHolder = user?.bankAccountHolder ?? null;
  const hasRealBank = Boolean(bankBin && bankAccountNumber);

  return {
    bankBin,
    bankName,
    bankAccountNumber,
    maskedAccountNumber: maskBankAccount(bankAccountNumber),
    bankAccountHolder,
    hasRealBank,
  };
}

export function formatInviteLink(inviteCode: string): string {
  return `https://chiane.app/moi/${inviteCode}`;
}

export interface ComputedGroupFinancials {
  totalSpentVnd: number;
  memberBalances: MemberBalance[];
  suggestedTransfers: SuggestedTransfer[];
  balancesMap: Map<string, number>;
}

export async function computeGroupFinancials(
  db: DbClient,
  groupId: string
): Promise<ComputedGroupFinancials> {
  const [members, expenses, settlements] = await Promise.all([
    db.groupMember.findMany({
      where: { groupId },
      select: { id: true, status: true },
    }),
    db.expense.findMany({
      where: { groupId, deletedAt: null },
      select: {
        amountVnd: true,
        paidByMemberId: true,
        deletedAt: true,
        splits: {
          select: {
            memberId: true,
            amountVnd: true,
          },
        },
      },
    }),
    db.settlement.findMany({
      where: { groupId },
      select: {
        fromMemberId: true,
        toMemberId: true,
        amountVnd: true,
        status: true,
      },
    }),
  ]);

  const memberIds = members.map((m) => m.id);
  const memberBalances = calculateNetBalances(
    memberIds,
    expenses.map((e) => ({
      amountVnd: e.amountVnd,
      paidByMemberId: e.paidByMemberId,
      deletedAt: e.deletedAt ? e.deletedAt.toISOString() : null,
      splits: e.splits.map((s) => ({
        memberId: s.memberId,
        amountVnd: s.amountVnd,
      })),
    })),
    settlements.map((s) => ({
      fromMemberId: s.fromMemberId,
      toMemberId: s.toMemberId,
      amountVnd: s.amountVnd,
      status: s.status as SettlementStatus,
    }))
  );

  const balancesMap = new Map<string, number>();
  for (const item of memberBalances) {
    balancesMap.set(item.memberId, item.netBalanceVnd);
  }

  const totalSpentVnd = expenses.reduce((sum, e) => sum + e.amountVnd, 0);
  const suggestedTransfers = optimizeSettlements(memberBalances);

  return {
    totalSpentVnd,
    memberBalances,
    suggestedTransfers,
    balancesMap,
  };
}

export async function assertNotArchived(db: DbClient, groupId: string) {
  const group = await db.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, isArchived: true },
  });

  if (!group) {
    throw new AppError(404, 'GROUP_NOT_FOUND', 'Không tìm thấy nhóm.');
  }

  if (group.isArchived) {
    throw new AppError(
      400,
      'GROUP_ARCHIVED',
      'Nhóm đã được lưu trữ, không thể thay đổi dữ liệu.'
    );
  }

  return group;
}
