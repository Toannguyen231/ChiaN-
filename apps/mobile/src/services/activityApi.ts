import type { ActivityItemDto, ReminderDto } from '@chiane/shared';
import { apiRequest } from './apiClient';

export type ActivityFilter = 'ALL' | 'EXPENSE' | 'PAYMENT';

export const activityApi = {
  listActivity(params: {
    filter?: ActivityFilter;
    groupId?: string;
    limit?: number;
  } = {}): Promise<{ activities: ActivityItemDto[] }> {
    const qs = new URLSearchParams();
    if (params.filter) qs.set('filter', params.filter);
    if (params.groupId) qs.set('groupId', params.groupId);
    if (params.limit) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest(`/api/v1/activity${suffix}`, { authenticated: true });
  },

  sendReminder(
    groupId: string,
    input: {
      recipientMemberId: string;
      amountVnd: number;
      message: string;
    }
  ): Promise<{ reminder: ReminderDto }> {
    return apiRequest(`/api/v1/groups/${groupId}/reminders`, {
      method: 'POST',
      body: input,
      authenticated: true,
    });
  },
};
