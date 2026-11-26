import type {
  GroupBalancesDto,
  MemberBalance,
  SettlementDto,
  SettlementMethod,
  SettlementStatus,
} from '@chiane/shared';
import { apiRequest } from './apiClient';

export const settlementsApi = {
  getBalances(groupId: string): Promise<GroupBalancesDto> {
    return apiRequest<GroupBalancesDto>(`/api/v1/groups/${groupId}/balances`, {
      authenticated: true,
    });
  },

  listSettlements(
    groupId: string,
    status?: SettlementStatus
  ): Promise<{ settlements: SettlementDto[] }> {
    const suffix = status ? `?status=${status}` : '';
    return apiRequest(`/api/v1/groups/${groupId}/settlements${suffix}`, {
      authenticated: true,
    });
  },

  getSettlement(settlementId: string): Promise<{
    settlement: SettlementDto;
    myNewGroupBalanceVnd: number;
  }> {
    return apiRequest(`/api/v1/settlements/${settlementId}`, {
      authenticated: true,
    });
  },

  reportSettlement(
    groupId: string,
    input: {
      fromMemberId: string;
      toMemberId: string;
      amountVnd: number;
      method: SettlementMethod;
      autoConfirm?: boolean;
      memo?: string;
      idempotencyKey?: string;
    }
  ): Promise<{ settlement: SettlementDto }> {
    return apiRequest(`/api/v1/groups/${groupId}/settlements/report`, {
      method: 'POST',
      body: input,
      authenticated: true,
    });
  },

  confirmSettlement(settlementId: string): Promise<{
    settlement: SettlementDto;
    updatedBalances: MemberBalance[];
    myNewGroupBalanceVnd: number;
  }> {
    return apiRequest(`/api/v1/settlements/${settlementId}/confirm`, {
      method: 'POST',
      body: {},
      authenticated: true,
    });
  },

  rejectSettlement(
    settlementId: string,
    reason?: string
  ): Promise<{ settlement: SettlementDto }> {
    return apiRequest(`/api/v1/settlements/${settlementId}/reject`, {
      method: 'POST',
      body: reason ? { reason } : {},
      authenticated: true,
    });
  },
};
