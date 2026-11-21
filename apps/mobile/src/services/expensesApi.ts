import type {
  ExpenseCategory,
  ExpenseDto,
  GroupMemberRole,
  SplitMethod,
} from '@chiane/shared';
import { apiRequest } from './apiClient';

export interface CreateExpenseInput {
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
  splits: Array<{
    memberId: string;
    amountVnd?: number;
    percentageBps?: number;
  }>;
}

export interface ExpenseDetailResponse {
  expense: ExpenseDto;
  groupName: string;
  isArchived: boolean;
  myMemberId: string;
  myRole: GroupMemberRole;
  canEdit: boolean;
  canDelete: boolean;
}

export interface UpdateExpenseInput
  extends Partial<Omit<CreateExpenseInput, 'note' | 'clientMutationId'>> {
  note?: string | null;
}

export const expensesApi = {
  listGroupExpenses(groupId: string): Promise<{ expenses: ExpenseDto[] }> {
    return apiRequest(`/api/v1/groups/${groupId}/expenses`, {
      authenticated: true,
    });
  },

  createExpense(
    groupId: string,
    input: CreateExpenseInput
  ): Promise<{ expense: ExpenseDto }> {
    return apiRequest(`/api/v1/groups/${groupId}/expenses`, {
      method: 'POST',
      body: input,
      authenticated: true,
    });
  },

  getExpense(expenseId: string): Promise<ExpenseDetailResponse> {
    return apiRequest(`/api/v1/expenses/${expenseId}`, {
      authenticated: true,
    });
  },

  updateExpense(
    expenseId: string,
    input: UpdateExpenseInput
  ): Promise<{ expense: ExpenseDto }> {
    return apiRequest(`/api/v1/expenses/${expenseId}`, {
      method: 'PATCH',
      body: input,
      authenticated: true,
    });
  },

  deleteExpense(expenseId: string): Promise<{ success: boolean }> {
    return apiRequest(`/api/v1/expenses/${expenseId}`, {
      method: 'DELETE',
      authenticated: true,
    });
  },
};
