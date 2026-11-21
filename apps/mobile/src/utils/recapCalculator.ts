import {
  formatVnd,
  type ExpenseCategory,
  type ExpenseDto,
  type GroupDetailDto,
  type SettlementDto,
} from '@chiane/shared';
import { colors } from '../theme/tokens';

export interface TripRecapAward {
  id: string;
  emoji: string;
  title: string;
  winnerName: string;
  statLabel: string;
}

export interface TripRecapCategoryItem {
  category: ExpenseCategory;
  label: string;
  color: string;
  amountVnd: number;
  percentage: number;
}

export interface TripRecapData {
  groupName: string;
  totalSpentVnd: number;
  expenseCount: number;
  memberCount: number;
  averagePerMemberVnd: number;
  tripDays: number;
  biggestExpense: {
    title: string;
    amountVnd: number;
    paidByName: string;
  } | null;
  categoryBreakdown: TripRecapCategoryItem[];
  awards: TripRecapAward[];
}

const CATEGORY_CONFIG: Record<
  ExpenseCategory,
  { label: string; color: string }
> = {
  FOOD: { label: 'Ăn uống', color: colors.lime },
  STAY: { label: 'Lưu trú', color: colors.lavender },
  TRANSPORT: { label: 'Di chuyển', color: colors.peach },
  COFFEE: { label: 'Cà phê', color: '#9EE6CF' },
  OTHER: { label: 'Khác', color: '#CEDFCB' },
};

const MS_PER_DAY = 86_400_000;

function computeTripDays(expenses: ExpenseDto[], groupCreatedAt: string): number {
  if (expenses.length === 0) return 1;
  const timestamps = expenses
    .map((e) => new Date(e.expenseDate).getTime())
    .filter((t) => Number.isFinite(t));
  if (timestamps.length === 0) {
    const createdMs = new Date(groupCreatedAt).getTime();
    if (!Number.isFinite(createdMs)) return 1;
    return Math.max(1, Math.floor((Date.now() - createdMs) / MS_PER_DAY) + 1);
  }
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);
  return Math.max(1, Math.round((maxTs - minTs) / MS_PER_DAY) + 1);
}

export function calculateTripRecap(
  group: GroupDetailDto,
  settlements: SettlementDto[] = []
): TripRecapData {
  const expenses = group.expenses;
  const totalSpentVnd = group.totalSpentVnd;
  const memberCount = group.memberCount;
  const averagePerMemberVnd =
    memberCount > 0 ? Math.round(totalSpentVnd / memberCount) : 0;
  const tripDays = computeTripDays(expenses, group.createdAt);

  // Biggest single expense
  let biggestExpense: TripRecapData['biggestExpense'] = null;
  for (const exp of expenses) {
    if (!biggestExpense || exp.amountVnd > biggestExpense.amountVnd) {
      biggestExpense = {
        title: exp.title,
        amountVnd: exp.amountVnd,
        paidByName: exp.isPaidFromPot ? 'Quỹ chung nhóm' : exp.paidByName,
      };
    }
  }

  // Category breakdown
  const catSums = new Map<ExpenseCategory, number>();
  for (const exp of expenses) {
    catSums.set(exp.category, (catSums.get(exp.category) ?? 0) + exp.amountVnd);
  }
  const categoryBreakdown: TripRecapCategoryItem[] = Array.from(catSums.entries())
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amountVnd]) => {
      const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.OTHER;
      return {
        category,
        label: cfg.label,
        color: cfg.color,
        amountVnd,
        percentage:
          totalSpentVnd > 0 ? Math.round((amountVnd / totalSpentVnd) * 100) : 0,
      };
    });

  // Ensure percentages neatly sum close to 100% by fixing rounding diff on largest category
  if (categoryBreakdown.length > 0 && totalSpentVnd > 0) {
    const pctSum = categoryBreakdown.reduce((s, c) => s + c.percentage, 0);
    if (pctSum !== 100) {
      categoryBreakdown[0]!.percentage = Math.max(
        1,
        categoryBreakdown[0]!.percentage + (100 - pctSum)
      );
    }
  }

  const awards: TripRecapAward[] = [];

  if (expenses.length > 0) {
    // 1. 👑 Đại gia gánh team (highest total paid on non-pot expenses, fallback all)
    const outOfPocket = expenses.filter((e) => !e.isPaidFromPot);
    const payerSource = outOfPocket.length > 0 ? outOfPocket : expenses;
    const paidByMember = new Map<string, { name: string; total: number }>();
    for (const exp of payerSource) {
      const prev = paidByMember.get(exp.paidByMemberId);
      paidByMember.set(exp.paidByMemberId, {
        name: exp.paidByName,
        total: (prev?.total ?? 0) + exp.amountVnd,
      });
    }
    const topPayer = Array.from(paidByMember.values()).sort(
      (a, b) => b.total - a.total
    )[0];
    if (topPayer) {
      awards.push({
        id: 'top_payer',
        emoji: '👑',
        title: 'Đại gia gánh team',
        winnerName: topPayer.name,
        statLabel: `Đã ứng ${formatVnd(topPayer.total)}`,
      });
    }

    // 2. ⚡ Bàn tay vàng thanh toán
    const confirmed = settlements
      .filter((s) => s.status === 'CONFIRMED')
      .sort((a, b) => {
        const ta = new Date(a.confirmedAt ?? a.reportedAt ?? a.createdAt).getTime();
        const tb = new Date(b.confirmedAt ?? b.reportedAt ?? b.createdAt).getTime();
        return ta - tb;
      });

    if (confirmed.length > 0) {
      const fastest = confirmed[0]!;
      awards.push({
        id: 'fastest_settler',
        emoji: '⚡',
        title: 'Bàn tay vàng thanh toán',
        winnerName: fastest.fromName,
        statLabel: `Chốt đơn ${formatVnd(fastest.amountVnd)} sớm nhất`,
      });
    } else {
      const settledMember = group.members.find((m) => m.netBalanceVnd === 0);
      if (settledMember) {
        awards.push({
          id: 'fastest_settler',
          emoji: '⚡',
          title: 'Bàn tay vàng thanh toán',
          winnerName: settledMember.displayName,
          statLabel: 'Số dư sạch bóng 0 ₫',
        });
      }
    }

    // 3. ☕ Bợm cà phê / Ăn vặt
    const snackStats = new Map<
      string,
      { name: string; coffeeCount: number; foodCount: number; weightedScore: number }
    >();
    const bumpMember = (memberId: string, name: string, cat: ExpenseCategory) => {
      if (cat !== 'COFFEE' && cat !== 'FOOD') return;
      const cur = snackStats.get(memberId) ?? {
        name,
        coffeeCount: 0,
        foodCount: 0,
        weightedScore: 0,
      };
      if (cat === 'COFFEE') {
        cur.coffeeCount += 1;
        cur.weightedScore += 2;
      } else {
        cur.foodCount += 1;
        cur.weightedScore += 1;
      }
      snackStats.set(memberId, cur);
    };

    for (const exp of expenses) {
      if (exp.category !== 'COFFEE' && exp.category !== 'FOOD') continue;
      bumpMember(exp.createdByMemberId, exp.createdByName, exp.category);
      for (const s of exp.splits) {
        bumpMember(s.memberId, s.memberName, exp.category);
      }
    }
    const topSnacker = Array.from(snackStats.values()).sort((a, b) =>
      b.weightedScore !== a.weightedScore
        ? b.weightedScore - a.weightedScore
        : b.coffeeCount - a.coffeeCount
    )[0];
    if (topSnacker) {
      const billCount = topSnacker.coffeeCount + topSnacker.foodCount;
      awards.push({
        id: 'snack_lover',
        emoji: '☕',
        title: 'Bợm cà phê / Ăn vặt',
        winnerName: topSnacker.name,
        statLabel: `${billCount} kèo ăn uống & cafe`,
      });
    }

    // 4. 💸 Chúa sống chậm
    const biggestDebtor = [...group.members]
      .filter((m) => m.netBalanceVnd < 0)
      .sort((a, b) => a.netBalanceVnd - b.netBalanceVnd)[0];

    if (biggestDebtor) {
      awards.push({
        id: 'slow_settler',
        emoji: '💸',
        title: 'Chúa sống chậm',
        winnerName: biggestDebtor.displayName,
        statLabel: `Còn nợ ${formatVnd(Math.abs(biggestDebtor.netBalanceVnd))}`,
      });
    } else if (confirmed.length > 0) {
      const latest = confirmed[confirmed.length - 1]!;
      awards.push({
        id: 'slow_settler',
        emoji: '💸',
        title: 'Chúa sống chậm',
        winnerName: latest.fromName,
        statLabel: 'Chốt sổ muộn nhưng vẫn uy tín!',
      });
    }
  }

  return {
    groupName: group.name,
    totalSpentVnd,
    expenseCount: group.expenseCount,
    memberCount,
    averagePerMemberVnd,
    tripDays,
    biggestExpense,
    categoryBreakdown,
    awards,
  };
}

export function buildRecapShareText(recap: TripRecapData): string {
  const lines = [
    `✨ TỔNG KẾT CHUYẾN ĐI "${recap.groupName.toUpperCase()}" TRÊN CHIANÈ ✨`,
    `💸 Tổng thiệt hại: ${formatVnd(recap.totalSpentVnd)} (${recap.tripDays} ngày · ${recap.memberCount} người)`,
    `🤝 Trung bình mỗi người: ${formatVnd(recap.averagePerMemberVnd)}`,
  ];

  if (recap.biggestExpense) {
    lines.push(
      `🔥 Khoản chi khủng nhất: ${recap.biggestExpense.title} (${formatVnd(recap.biggestExpense.amountVnd)})`
    );
  }

  if (recap.awards.length > 0) {
    lines.push('', '🏆 BẢNG VÀNG DANH HIỆU:');
    for (const award of recap.awards) {
      lines.push(`${award.emoji} ${award.title}: ${award.winnerName} (${award.statLabel})`);
    }
  }

  lines.push('', '📲 Chia tiền sòng phẳng, không mất lòng bạn bè cùng ChiaNè!');
  return lines.join('\n');
}
