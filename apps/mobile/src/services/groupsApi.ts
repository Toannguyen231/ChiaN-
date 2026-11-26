import type {
  DashboardDto,
  GroupCategory,
  GroupDetailDto,
  GroupMemberDto,
  GroupSummaryDto,
  MemberDetailDto,
} from '@chiane/shared';
import { apiRequest } from './apiClient';

export const groupsApi = {
  getDashboard(): Promise<DashboardDto> {
    return apiRequest<DashboardDto>('/api/v1/dashboard', { authenticated: true });
  },

  listGroups(params: { archived?: boolean; search?: string } = {}): Promise<{
    groups: GroupSummaryDto[];
  }> {
    const qs = new URLSearchParams();
    if (params.archived !== undefined) {
      qs.set('archived', String(params.archived));
    }
    if (params.search?.trim()) {
      qs.set('search', params.search.trim());
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest<{ groups: GroupSummaryDto[] }>(`/api/v1/groups${suffix}`, {
      authenticated: true,
    });
  },

  createGroup(input: {
    name: string;
    category: GroupCategory;
  }): Promise<{ group: GroupDetailDto }> {
    return apiRequest<{ group: GroupDetailDto }>('/api/v1/groups', {
      method: 'POST',
      body: { ...input, currency: 'VND' },
      authenticated: true,
    });
  },

  getGroup(groupId: string): Promise<{ group: GroupDetailDto }> {
    return apiRequest<{ group: GroupDetailDto }>(`/api/v1/groups/${groupId}`, {
      authenticated: true,
    });
  },

  updateGroup(
    groupId: string,
    input: { name?: string; category?: GroupCategory }
  ): Promise<{ group: GroupDetailDto }> {
    return apiRequest<{ group: GroupDetailDto }>(`/api/v1/groups/${groupId}`, {
      method: 'PATCH',
      body: input,
      authenticated: true,
    });
  },

  deleteGroup(groupId: string): Promise<{ success: boolean }> {
    return apiRequest(`/api/v1/groups/${groupId}`, { method: 'DELETE', authenticated: true });
  },

  archiveGroup(groupId: string, archived: boolean): Promise<{ group: GroupDetailDto }> {
    return apiRequest<{ group: GroupDetailDto }>(`/api/v1/groups/${groupId}/archive`, {
      method: 'POST',
      body: { archived },
      authenticated: true,
    });
  },

  leaveGroup(groupId: string): Promise<{
    success: boolean;
    archivedGroup: boolean;
    promotedMemberId: string | null;
  }> {
    return apiRequest(`/api/v1/groups/${groupId}/leave`, {
      method: 'POST',
      body: {},
      authenticated: true,
    });
  },

  regenerateInviteLink(groupId: string): Promise<{
    inviteCode: string;
    inviteLink: string;
  }> {
    return apiRequest(`/api/v1/groups/${groupId}/invite-link/regenerate`, {
      method: 'POST',
      body: {},
      authenticated: true,
    });
  },

  addMember(
    groupId: string,
    input: { displayName: string; phone?: string }
  ): Promise<{ member: GroupMemberDto }> {
    return apiRequest(`/api/v1/groups/${groupId}/members`, {
      method: 'POST',
      body: input,
      authenticated: true,
    });
  },

  removeMember(groupId: string, memberId: string): Promise<{ success: boolean }> {
    return apiRequest(`/api/v1/groups/${groupId}/members/${memberId}`, {
      method: 'DELETE',
      authenticated: true,
    });
  },

  getMemberDetails(groupId: string, memberId: string): Promise<MemberDetailDto> {
    return apiRequest<MemberDetailDto>(
      `/api/v1/groups/${groupId}/members/${memberId}`,
      { authenticated: true }
    );
  },

  joinByInviteCode(inviteCode: string, claimMemberId?: string): Promise<{
    groupId: string;
    memberId: string;
    alreadyMember: boolean;
  }> {
    return apiRequest(`/api/v1/invites/${encodeURIComponent(inviteCode)}/join`, {
      method: 'POST',
      body: { claimMemberId },
      authenticated: true,
    });
  },

  exportExcelBase64(groupId: string): Promise<{
    filename: string;
    mimeType: string;
    base64: string;
    byteLength: number;
  }> {
    return apiRequest(`/api/v1/groups/${groupId}/export/xlsx-base64`, {
      authenticated: true,
    });
  },
};
