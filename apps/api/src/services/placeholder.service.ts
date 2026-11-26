import type { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors';

export function isPlaceholder(member: { userId: string | null; guestTokenHash: string | null }) {
  return member.userId === null && member.guestTokenHash === null;
}

export async function claimPlaceholder(
  tx: Prisma.TransactionClient,
  groupId: string,
  id: string,
  identity: { role: 'MEMBER'; userId: string } | { role: 'GUEST'; guestTokenHash: string },
  displayName?: string
) {
  const where = { id, groupId, status: 'ACTIVE', userId: null, guestTokenHash: null };
  const original = await tx.groupMember.findFirst({ where });
  const result = await tx.groupMember.updateMany({
    where,
    data: { ...identity, ...(displayName ? { displayName } : {}) },
  });
  if (!original || result.count !== 1) {
    throw new AppError(409, 'MEMBER_ALREADY_CLAIMED', 'Tên này không còn khả dụng. Bạn chọn tên khác nhé.');
  }
  return { ...original, ...identity, displayName: displayName || original.displayName, originalName: original.displayName };
}
