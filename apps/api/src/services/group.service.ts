import crypto from 'node:crypto';
import type {
  ExpenseCategory,
  ExpenseDto,
  GroupCategory,
  GroupDetailDto,
  GroupMemberDto,
  GroupMemberRole,
  GroupMemberStatus,
  GroupSummaryDto,
  SplitMethod,
} from '@chiane/shared';
import {
  buildBankPreview,
  computeGroupFinancials,
  formatInviteLink,
  type DbClient,
} from './balance.service';
import { AppError } from '../utils/errors';

function slugifyPrefix(name: string): string {
  const ascii = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 12);
  return ascii || 'chiane';
}

export async function generateUniqueInviteCode(
  db: DbClient,
  groupName: string
): Promise<string> {
  const prefix = slugifyPrefix(groupName);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = crypto.randomBytes(3).toString('hex');
    const candidate = `${prefix}-${suffix}`;
    const existing = await db.group.findUnique({
      where: { inviteCode: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function serializeExpenseRecord(
  expense: {
    id: string;
    groupId: string;
    title: string;
    amountVnd: number;
    category: string;
    splitMethod: string;
    paidByMemberId: string;
    createdByMemberId: string;
    expenseDate: Date;
    note: string | null;
    receiptImageUrl: string | null;
    clientMutationId: string | null;
    isPaidFromPot?: boolean;
    createdAt: Date;
    updatedAt: Date;
    paidByMember: { displayName: string };
    createdByMember: { displayName: string };
    splits: Array<{
      id: string;
      memberId: string;
      amountVnd: number;
      percentageBps: number | null;
      member: { displayName: string };
    }>;
  },
  myMemberId: string
): ExpenseDto {
  const mySplit = expense.splits.find((s) => s.memberId === myMemberId);

  return {
    id: expense.id,
    groupId: expense.groupId,
    title: expense.title,
    amountVnd: expense.amountVnd,
    category: expense.category as ExpenseCategory,
    splitMethod: expense.splitMethod as SplitMethod,
    paidByMemberId: expense.paidByMemberId,
    paidByName: expense.paidByMember.displayName,
    createdByMemberId: expense.createdByMemberId,
    createdByName: expense.createdByMember.displayName,
    expenseDate: expense.expenseDate.toISOString(),
    note: expense.note,
    receiptImageUrl: expense.receiptImageUrl,
    clientMutationId: expense.clientMutationId,
    isPaidFromPot: Boolean(expense.isPaidFromPot),
    myShareVnd: mySplit?.amountVnd ?? 0,
    splitCount: expense.splits.length,
    splits: expense.splits.map((split) => ({
      id: split.id,
      memberId: split.memberId,
      memberName: split.member.displayName,
      amountVnd: split.amountVnd,
      percentageBps: split.percentageBps,
      isPayer: split.memberId === expense.paidByMemberId,
      isMe: split.memberId === myMemberId,
    })),
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  };
}

export async function getGroupSummaryForMember(
  db: DbClient,
  groupId: string,
  myMemberId: string,
  myRole: GroupMemberRole
): Promise<GroupSummaryDto> {
  const group = await db.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        where: { status: 'ACTIVE' },
        select: { id: true },
      },
      expenses: {
        where: { deletedAt: null },
        select: { id: true },
      },
    },
  });

  if (!group) {
    throw new AppError(404, 'GROUP_NOT_FOUND', 'Không tìm thấy nhóm.');
  }

  const financials = await computeGroupFinancials(db, groupId);

  return {
    id: group.id,
    name: group.name,
    category: group.category as GroupCategory,
    currency: 'VND',
    inviteCode: group.inviteCode,
    inviteLink: formatInviteLink(group.inviteCode),
    isArchived: group.isArchived,
    memberCount: group.members.length,
    expenseCount: group.expenses.length,
    totalSpentVnd: financials.totalSpentVnd,
    myBalanceVnd: financials.balancesMap.get(myMemberId) ?? 0,
    myRole,
    myMemberId,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

export async function getGroupDetailForMember(
  db: DbClient,
  groupId: string,
  myMemberId: string,
  myRole: GroupMemberRole
): Promise<GroupDetailDto> {
  const group = await db.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        where: { status: 'ACTIVE' },
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
      },
      expenses: {
        where: { deletedAt: null },
        include: {
          paidByMember: { select: { displayName: true } },
          createdByMember: { select: { displayName: true } },
          splits: {
            include: {
              member: { select: { displayName: true } },
            },
          },
        },
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
      },
    },
  });

  if (!group) {
    throw new AppError(404, 'GROUP_NOT_FOUND', 'Không tìm thấy nhóm.');
  }

  const [financials, pendingSettlementsCount] = await Promise.all([
    computeGroupFinancials(db, groupId),
    db.settlement.count({
      where: { groupId, status: 'REPORTED' },
    }),
  ]);

  const members: GroupMemberDto[] = group.members.map((m) => ({
    id: m.id,
    userId: m.userId,
    displayName: m.displayName,
    role: m.role as GroupMemberRole,
    status: m.status as GroupMemberStatus,
    netBalanceVnd: financials.balancesMap.get(m.id) ?? 0,
    isMe: m.id === myMemberId,
    bankPreview: buildBankPreview(m.user),
    joinedAt: m.joinedAt.toISOString(),
  }));

  const expenses: ExpenseDto[] = group.expenses.map((expense) =>
    serializeExpenseRecord(expense, myMemberId)
  );

  return {
    id: group.id,
    name: group.name,
    category: group.category as GroupCategory,
    currency: 'VND',
    inviteCode: group.inviteCode,
    inviteLink: formatInviteLink(group.inviteCode),
    isArchived: group.isArchived,
    memberCount: members.length,
    expenseCount: expenses.length,
    totalSpentVnd: financials.totalSpentVnd,
    myBalanceVnd: financials.balancesMap.get(myMemberId) ?? 0,
    myMemberId,
    myRole,
    pendingSettlementsCount,
    members,
    expenses,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}
