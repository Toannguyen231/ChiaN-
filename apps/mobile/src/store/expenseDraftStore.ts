import { create } from 'zustand';
import type {
  ExpenseCategory,
  ExpenseDto,
  GroupMemberDto,
  ReceiptItemDto,
  SplitMethod,
} from '@chiane/shared';

export interface ExpenseDraftState {
  groupId: string | null;
  expenseId: string | null;
  title: string;
  amountVnd: number;
  category: ExpenseCategory;
  splitMethod: SplitMethod;
  paidByMemberId: string;
  expenseDateIso: string;
  note: string;
  receiptImageUrl: string;
  isPaidFromPot: boolean;
  scannedItems: ReceiptItemDto[];
  participantIds: string[];
  exactAmountsByMember: Record<string, number>;
  percentageBpsByMember: Record<string, number>;

  initNew: (groupId: string, members: GroupMemberDto[], myMemberId: string) => void;
  initFromExpense: (expense: ExpenseDto, members: GroupMemberDto[]) => void;
  patchDraft: (
    patch: Partial<
      Omit<ExpenseDraftState, 'initNew' | 'initFromExpense' | 'patchDraft' | 'clearDraft'>
    >
  ) => void;
  clearDraft: () => void;
}

function buildDefaultPercentages(memberIds: string[]): Record<string, number> {
  if (memberIds.length === 0) return {};
  const base = Math.floor(10000 / memberIds.length);
  const rem = 10000 % memberIds.length;
  const map: Record<string, number> = {};
  memberIds.forEach((id, idx) => {
    map[id] = base + (idx < rem ? 1 : 0);
  });
  return map;
}

export const useExpenseDraftStore = create<ExpenseDraftState>((set) => ({
  groupId: null,
  expenseId: null,
  title: '',
  amountVnd: 0,
  category: 'FOOD',
  splitMethod: 'EQUAL',
  paidByMemberId: '',
  expenseDateIso: new Date().toISOString(),
  note: '',
  receiptImageUrl: '',
  isPaidFromPot: false,
  scannedItems: [],
  participantIds: [],
  exactAmountsByMember: {},
  percentageBpsByMember: {},

  initNew(groupId, members, myMemberId) {
    const memberIds = members.map((m) => m.id);
    const defaultPayer = memberIds.includes(myMemberId)
      ? myMemberId
      : memberIds[0] ?? '';

    set({
      groupId,
      expenseId: null,
      title: '',
      amountVnd: 0,
      category: 'FOOD',
      splitMethod: 'EQUAL',
      paidByMemberId: defaultPayer,
      expenseDateIso: new Date().toISOString(),
      note: '',
      receiptImageUrl: '',
      isPaidFromPot: false,
      scannedItems: [],
      participantIds: memberIds,
      exactAmountsByMember: {},
      percentageBpsByMember: buildDefaultPercentages(memberIds),
    });
  },

  initFromExpense(expense, members) {
    const exactMap: Record<string, number> = {};
    const pctMap: Record<string, number> = buildDefaultPercentages(
      members.map((m) => m.id)
    );
    const participantIds = expense.splits.map((s) => s.memberId);

    for (const s of expense.splits) {
      exactMap[s.memberId] = s.amountVnd;
      if (s.percentageBps !== null) {
        pctMap[s.memberId] = s.percentageBps;
      }
    }

    set({
      groupId: expense.groupId,
      expenseId: expense.id,
      title: expense.title,
      amountVnd: expense.amountVnd,
      category: expense.category,
      splitMethod: expense.splitMethod,
      paidByMemberId: expense.paidByMemberId,
      expenseDateIso: expense.expenseDate,
      note: expense.note ?? '',
      receiptImageUrl: expense.receiptImageUrl ?? '',
      isPaidFromPot: Boolean(expense.isPaidFromPot),
      scannedItems: [],
      participantIds,
      exactAmountsByMember: exactMap,
      percentageBpsByMember: pctMap,
    });
  },

  patchDraft(patch) {
    set((state) => ({ ...state, ...patch }));
  },

  clearDraft() {
    set({
      groupId: null,
      expenseId: null,
      title: '',
      amountVnd: 0,
      category: 'FOOD',
      splitMethod: 'EQUAL',
      paidByMemberId: '',
      expenseDateIso: new Date().toISOString(),
      note: '',
      receiptImageUrl: '',
      isPaidFromPot: false,
      scannedItems: [],
      participantIds: [],
      exactAmountsByMember: {},
      percentageBpsByMember: {},
    });
  },
}));
