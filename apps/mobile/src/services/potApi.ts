import type { GroupPotContributionDto, GroupPotDto } from '@chiane/shared';
import { apiRequest } from './apiClient';

export const potApi = {
  getPot(groupId: string): Promise<GroupPotDto> {
    return apiRequest<GroupPotDto>(`/api/v1/groups/${groupId}/pot`, {
      authenticated: true,
    });
  },

  contribute(
    groupId: string,
    input: { memberId?: string; amountVnd: number; note?: string }
  ): Promise<{ contribution: GroupPotContributionDto; pot: GroupPotDto }> {
    return apiRequest(`/api/v1/groups/${groupId}/pot/contribute`, {
      method: 'POST',
      body: input,
      authenticated: true,
    });
  },
};
