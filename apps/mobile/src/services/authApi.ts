import type {
  AuthTokens,
  OtpRequestResponse,
  OtpVerifyResponse,
  UserProfile,
} from '@chiane/shared';
import { apiRequest } from './apiClient';

export interface UpdateProfilePayload {
  displayName?: string;
  bankBin?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountHolder?: string | null;
  notifyReminders?: boolean;
  notifyExpenses?: boolean;
}

export const authApi = {
  requestOtp(phone: string): Promise<OtpRequestResponse> {
    return apiRequest<OtpRequestResponse>('/api/v1/auth/otp/request', {
      method: 'POST',
      body: { phone },
    });
  },

  verifyOtp(phone: string, code: string): Promise<OtpVerifyResponse> {
    return apiRequest<OtpVerifyResponse>('/api/v1/auth/otp/verify', {
      method: 'POST',
      body: { phone, code },
    });
  },

  refreshSession(refreshToken: string): Promise<AuthTokens & { user: UserProfile }> {
    return apiRequest<AuthTokens & { user: UserProfile }>('/api/v1/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
    });
  },

  logout(refreshToken: string | null): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>('/api/v1/auth/logout', {
      method: 'POST',
      body: refreshToken ? { refreshToken } : {},
    });
  },

  getMe(): Promise<{ user: UserProfile }> {
    return apiRequest<{ user: UserProfile }>('/api/v1/auth/me', {
      method: 'GET',
      authenticated: true,
    });
  },

  updateMe(payload: UpdateProfilePayload): Promise<{ user: UserProfile }> {
    return apiRequest<{ user: UserProfile }>('/api/v1/auth/me', {
      method: 'PATCH',
      body: payload,
      authenticated: true,
    });
  },

  requestPhoneChange(phone: string): Promise<OtpRequestResponse> {
    return apiRequest<OtpRequestResponse>('/api/v1/auth/phone/request', {
      method: 'POST',
      body: { phone },
      authenticated: true,
    });
  },

  verifyPhoneChange(
    phone: string,
    code: string
  ): Promise<AuthTokens & { user: UserProfile }> {
    return apiRequest<AuthTokens & { user: UserProfile }>('/api/v1/auth/phone/verify', {
      method: 'POST',
      body: { phone, code },
      authenticated: true,
    });
  },
};
