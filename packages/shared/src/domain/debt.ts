import type { SettlementStatus } from '../types';
import type { SplitShare } from './split';

export interface DebtExpenseInput {
  amountVnd: number;
  paidByMemberId: string;
  splits: SplitShare[];
  deletedAt?: string | null;
  isPaidFromPot?: boolean;
}

export interface DebtSettlementInput {
  fromMemberId: string;
  toMemberId: string;
  amountVnd: number;
  status: SettlementStatus;
}

export interface MemberBalance {
  memberId: string;
  netBalanceVnd: number; // positive = owed money (+), negative = owes money (−)
}

export interface SuggestedTransfer {
  fromMemberId: string;
  toMemberId: string;
  amountVnd: number;
}

/**
 * Calculates each member's net balance in VND.
 * Positive means others owe this member; negative means this member owes others.
 * ONLY CONFIRMED settlements modify group balances (pending/reported/rejected are ignored).
 */
export function calculateNetBalances(
  memberIds: string[],
  expenses: DebtExpenseInput[],
  settlements: DebtSettlementInput[]
): MemberBalance[] {
  const balances = new Map<string, number>();
  for (const id of memberIds) {
    balances.set(id, 0);
  }

  for (const expense of expenses) {
    if (expense.deletedAt || expense.isPaidFromPot) {
      continue;
    }
    if (!balances.has(expense.paidByMemberId)) {
      balances.set(expense.paidByMemberId, 0);
    }
    balances.set(
      expense.paidByMemberId,
      (balances.get(expense.paidByMemberId) ?? 0) + expense.amountVnd
    );

    let splitSum = 0;
    for (const split of expense.splits) {
      splitSum += split.amountVnd;
      if (!balances.has(split.memberId)) {
        balances.set(split.memberId, 0);
      }
      balances.set(split.memberId, (balances.get(split.memberId) ?? 0) - split.amountVnd);
    }

    if (splitSum !== expense.amountVnd) {
      throw new Error(`Expense splits sum (${splitSum}) does not equal expense amount (${expense.amountVnd})`);
    }
  }

  for (const settlement of settlements) {
    if (settlement.status !== 'CONFIRMED') {
      continue;
    }
    // Paying a debt increases the payer's net balance (moves from negative toward 0)
    // and decreases the recipient's net balance (moves from positive toward 0).
    balances.set(
      settlement.fromMemberId,
      (balances.get(settlement.fromMemberId) ?? 0) + settlement.amountVnd
    );
    balances.set(
      settlement.toMemberId,
      (balances.get(settlement.toMemberId) ?? 0) - settlement.amountVnd
    );
  }

  let totalNet = 0;
  const result: MemberBalance[] = [];
  for (const [memberId, netBalanceVnd] of balances.entries()) {
    totalNet += netBalanceVnd;
    result.push({ memberId, netBalanceVnd });
  }

  if (totalNet !== 0) {
    throw new Error(`Zero-sum balance invariant violated: totalNet=${totalNet}`);
  }

  return result;
}

/**
 * Computes a deterministic minimal-transfer settlement plan using greedy matching
 * between largest debtors and largest creditors.
 */
export function optimizeSettlements(balances: MemberBalance[]): SuggestedTransfer[] {
  const debtors = balances
    .filter((b) => b.netBalanceVnd < 0)
    .map((b) => ({ memberId: b.memberId, amount: -b.netBalanceVnd }))
    .sort((a, b) => (b.amount !== a.amount ? b.amount - a.amount : a.memberId.localeCompare(b.memberId)));

  const creditors = balances
    .filter((b) => b.netBalanceVnd > 0)
    .map((b) => ({ memberId: b.memberId, amount: b.netBalanceVnd }))
    .sort((a, b) => (b.amount !== a.amount ? b.amount - a.amount : a.memberId.localeCompare(b.memberId)));

  const transfers: SuggestedTransfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]!;
    const creditor = creditors[j]!;
    const transferAmount = Math.min(debtor.amount, creditor.amount);

    if (transferAmount > 0) {
      transfers.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amountVnd: transferAmount,
      });
    }

    debtor.amount -= transferAmount;
    creditor.amount -= transferAmount;

    if (debtor.amount === 0) {
      i += 1;
    }
    if (creditor.amount === 0) {
      j += 1;
    }
  }

  return transfers;
}
