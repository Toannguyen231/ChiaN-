import { formatVnd } from '@chiane/shared';
import type { PrismaClient } from '@prisma/client';

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound?: 'default';
  data?: Record<string, unknown>;
}

function isExpoPushToken(token: string | null | undefined): token is string {
  return Boolean(
    token &&
      (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['))
  );
}

/**
 * Send push notifications via Expo Push API.
 * No-ops during unit/integration tests and fails open so push issues never break core mutations.
 */
export async function sendExpoPushMessages(messages: ExpoPushMessage[]): Promise<void> {
  const valid = messages.filter((m) => isExpoPushToken(m.to));
  if (valid.length === 0 || process.env.NODE_ENV === 'test') {
    return;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  try {
    for (let i = 0; i < valid.length; i += 100) {
      const chunk = valid.slice(i, i + 100);
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk),
      });
    }
  } catch (err) {
    console.warn('[ChiaNè Push] Failed to dispatch Expo push notifications:', err);
  }
}

export async function notifyExpenseCreated(
  prisma: PrismaClient,
  params: {
    groupId: string;
    expenseId: string;
    title: string;
    amountVnd: number;
    payerName: string;
    actorMemberId: string;
    isPaidFromPot: boolean;
    splitMemberIds: string[];
  }
): Promise<void> {
  if (params.splitMemberIds.length === 0) return;

  try {
    const members = await prisma.groupMember.findMany({
      where: {
        groupId: params.groupId,
        id: { in: params.splitMemberIds },
        status: 'ACTIVE',
      },
      include: {
        user: {
          select: {
            expoPushToken: true,
            notifyExpenses: true,
          },
        },
        group: {
          select: { name: true },
        },
      },
    });

    const seenTokens = new Set<string>();
    const messages: ExpoPushMessage[] = [];
    for (const member of members) {
      if (member.id === params.actorMemberId) continue;
      if (!member.user?.notifyExpenses) continue;
      if (!isExpoPushToken(member.user.expoPushToken)) continue;
      if (seenTokens.has(member.user.expoPushToken)) continue;
      seenTokens.add(member.user.expoPushToken);

      messages.push({
        to: member.user.expoPushToken,
        sound: 'default',
        title: `ChiaNè · ${member.group.name}`,
        body: params.isPaidFromPot
          ? `Quỹ chung vừa chi "${params.title}" (${formatVnd(params.amountVnd)}).`
          : `${params.payerName} vừa thêm "${params.title}" (${formatVnd(params.amountVnd)}).`,
        data: {
          screen: 'GroupDetails',
          groupId: params.groupId,
          expenseId: params.expenseId,
        },
      });
    }

    await sendExpoPushMessages(messages);
  } catch (err) {
    console.warn('[ChiaNè Push] notifyExpenseCreated error:', err);
  }
}

export async function notifySettlementReported(
  prisma: PrismaClient,
  params: {
    settlementId: string;
    groupId: string;
    groupName: string;
    fromName: string;
    toMemberId: string;
    amountVnd: number;
  }
): Promise<void> {
  try {
    const recipient = await prisma.groupMember.findUnique({
      where: { id: params.toMemberId },
      include: {
        user: {
          select: {
            expoPushToken: true,
            notifyExpenses: true,
          },
        },
      },
    });

    if (!recipient?.user?.notifyExpenses || !isExpoPushToken(recipient.user.expoPushToken)) {
      return;
    }

    await sendExpoPushMessages([
      {
        to: recipient.user.expoPushToken,
        sound: 'default',
        title: `Chờ xác nhận nhận tiền · ${params.groupName}`,
        body: `${params.fromName} báo đã chuyển ${formatVnd(params.amountVnd)}. Bấm để xác nhận ngay!`,
        data: {
          screen: 'ConfirmPaymentReceived',
          settlementId: params.settlementId,
          groupId: params.groupId,
        },
      },
    ]);
  } catch (err) {
    console.warn('[ChiaNè Push] notifySettlementReported error:', err);
  }
}

export async function notifyFriendlyReminder(
  prisma: PrismaClient,
  params: {
    groupId: string;
    groupName: string;
    senderName: string;
    recipientMemberId: string;
    amountVnd: number;
    message: string;
  }
): Promise<void> {
  try {
    const recipient = await prisma.groupMember.findUnique({
      where: { id: params.recipientMemberId },
      include: {
        user: {
          select: {
            expoPushToken: true,
            notifyReminders: true,
          },
        },
      },
    });

    if (!recipient?.user?.notifyReminders || !isExpoPushToken(recipient.user.expoPushToken)) {
      return;
    }

    await sendExpoPushMessages([
      {
        to: recipient.user.expoPushToken,
        sound: 'default',
        title: `${params.senderName} nhắc nhẹ (${params.groupName})`,
        body: `${formatVnd(params.amountVnd)}: ${params.message}`,
        data: {
          screen: 'GroupDetails',
          groupId: params.groupId,
        },
      },
    ]);
  } catch (err) {
    console.warn('[ChiaNè Push] notifyFriendlyReminder error:', err);
  }
}
