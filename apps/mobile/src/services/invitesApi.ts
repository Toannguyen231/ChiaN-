import type { GuestSessionDto, InvitePreviewDto } from '@chiane/shared';
import { apiRequest } from './apiClient';

/** Extracts the invite code from either a full chiane invite URL or bare code string. */
export function extractInviteCode(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return '';
  }
  const match = trimmed.match(/(?:https?:\/\/[^/]+|chiane:\/\/)?\/?moi\/([^/?#\s]+)/i);
  if (match?.[1]) {
    return match[1].trim();
  }
  return trimmed.replace(/^\/+|\/+$/g, '');
}

export const invitesApi = {
  getInvitePreview(inviteCode: string): Promise<InvitePreviewDto> {
    return apiRequest<InvitePreviewDto>(
      `/api/v1/invites/${encodeURIComponent(inviteCode)}`,
      { authenticated: false }
    );
  },

  joinAsGuest(inviteCode: string, displayName?: string, claimMemberId?: string): Promise<GuestSessionDto> {
    return apiRequest<GuestSessionDto>(
      `/api/v1/invites/${encodeURIComponent(inviteCode)}/join-guest`,
      {
        method: 'POST',
        body: { displayName, claimMemberId },
        authenticated: false,
      }
    );
  },

  claimGuest(guestToken: string): Promise<{ groupId: string; memberId: string }> {
    return apiRequest('/api/v1/invites/claim-guest', {
      method: 'POST',
      body: { guestToken },
      authenticated: true,
    });
  },
};
