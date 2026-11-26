import { create } from 'zustand';
import type {
  AuthTokens,
  GuestSessionDto,
  OtpRequestResponse,
  UserProfile,
} from '@chiane/shared';
import { setOnUnauthorizedHandler } from '../services/apiClient';
import { authApi } from '../services/authApi';
import { invitesApi } from '../services/invitesApi';
import { tokenStorage } from '../services/tokenStorage';

export type AuthStatus =
  | 'bootstrapping'
  | 'unauthenticated'
  | 'guest'
  | 'needs_profile'
  | 'authenticated';

interface AuthState {
  status: AuthStatus;
  user: UserProfile | null;
  guestSession: GuestSessionDto | null;
  pendingClaimGuestToken: string | null;
  pendingPhone: string | null;
  otpExpiresInSeconds: number;
  resendCooldownSeconds: number;
  devOtpHint: string | null;

  bootstrap: () => Promise<void>;
  requestOtp: (phone: string) => Promise<OtpRequestResponse>;
  verifyOtp: (phone: string, code: string) => Promise<{ needsProfile: boolean }>;
  completeProfile: (displayName: string) => Promise<void>;
  skipProfileSetup: () => void;
  refreshProfile: () => Promise<void>;
  applyPhoneChangeResult: (res: AuthTokens & { user: UserProfile }) => Promise<void>;
  enterGuestSession: (session: GuestSessionDto) => Promise<void>;
  exitGuestSession: () => Promise<void>;
  startGuestUpgrade: () => void;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => {
  setOnUnauthorizedHandler(() => {
    const currentStatus = get().status;
    if (currentStatus === 'guest') {
      void tokenStorage.clearGuestSession();
      set({
        status: 'unauthenticated',
        guestSession: null,
        pendingClaimGuestToken: null,
      });
      return;
    }
    set({
      status: 'unauthenticated',
      user: null,
      devOtpHint: null,
    });
  });

  return {
    status: 'bootstrapping',
    user: null,
    guestSession: null,
    pendingClaimGuestToken: null,
    pendingPhone: null,
    otpExpiresInSeconds: 300,
    resendCooldownSeconds: 30,
    devOtpHint: null,

    async bootstrap() {
      try {
        const [accessToken, refreshToken] = await Promise.all([
          tokenStorage.getAccessToken(),
          tokenStorage.getRefreshToken(),
        ]);

        if (accessToken || refreshToken) {
          const { user } = await authApi.getMe();
          set({
            user,
            guestSession: null,
            status: user.displayName.trim() ? 'authenticated' : 'needs_profile',
          });
          return;
        }

        const guestSession = await tokenStorage.getGuestSession();
        if (guestSession?.guestToken) {
          set({
            guestSession,
            user: null,
            status: 'guest',
          });
          return;
        }

        set({ status: 'unauthenticated', user: null, guestSession: null });
      } catch {
        await tokenStorage.clearTokens();
        const guestSession = await tokenStorage.getGuestSession();
        if (guestSession?.guestToken) {
          set({ status: 'guest', user: null, guestSession });
        } else {
          set({ status: 'unauthenticated', user: null, guestSession: null });
        }
      }
    },

    async requestOtp(phone: string) {
      const response = await authApi.requestOtp(phone);
      set({
        pendingPhone: response.phone,
        otpExpiresInSeconds: response.expiresInSeconds,
        resendCooldownSeconds: response.resendCooldownSeconds,
        devOtpHint: response.devOtp ?? null,
      });
      return response;
    },

    async verifyOtp(phone: string, code: string) {
      const result = await authApi.verifyOtp(phone, code);
      await tokenStorage.saveTokens(result.accessToken, result.refreshToken);

      const guestToken =
        get().pendingClaimGuestToken ??
        (await tokenStorage.getGuestSession())?.guestToken;

      if (guestToken) {
        try {
          await invitesApi.claimGuest(guestToken);
        } catch {
          // Ignore if already claimed or invalidated
        }
        await tokenStorage.clearGuestSession();
      }

      const needsProfile = !result.user.displayName.trim();
      set({
        user: result.user,
        guestSession: null,
        pendingClaimGuestToken: null,
        pendingPhone: null,
        devOtpHint: null,
        status: needsProfile ? 'needs_profile' : 'authenticated',
      });
      return { needsProfile };
    },

    async completeProfile(displayName: string) {
      const { user } = await authApi.updateMe({ displayName: displayName.trim() });
      set({ user, status: 'authenticated' });
    },

    skipProfileSetup() {
      const current = get().user;
      if (current) {
        set({ status: 'authenticated' });
      }
    },

    async refreshProfile() {
      const { user } = await authApi.getMe();
      set({ user });
    },

    async applyPhoneChangeResult(res) {
      await tokenStorage.saveTokens(res.accessToken, res.refreshToken);
      set({ user: res.user });
    },

    async enterGuestSession(session) {
      await tokenStorage.clearTokens();
      await tokenStorage.saveGuestSession(session);
      set({
        status: 'guest',
        user: null,
        guestSession: session,
        pendingClaimGuestToken: null,
      });
    },

    async exitGuestSession() {
      await tokenStorage.clearGuestSession();
      set({
        status: 'unauthenticated',
        guestSession: null,
        pendingClaimGuestToken: null,
      });
    },

    startGuestUpgrade() {
      const currentGuest = get().guestSession;
      set({
        pendingClaimGuestToken: currentGuest?.guestToken ?? null,
        status: 'unauthenticated',
      });
    },

    async logout() {
      const refreshToken = await tokenStorage.getRefreshToken();
      try {
        await authApi.logout(refreshToken);
      } catch {
        // Always clear local session even if server unreachable
      }
      await Promise.all([
        tokenStorage.clearTokens(),
        tokenStorage.clearGuestSession(),
      ]);
      set({
        status: 'unauthenticated',
        user: null,
        guestSession: null,
        pendingClaimGuestToken: null,
        pendingPhone: null,
        devOtpHint: null,
      });
    },

    async deleteAccount() {
      await authApi.deleteAccount();
      await Promise.all([
        tokenStorage.clearTokens(),
        tokenStorage.clearGuestSession(),
      ]);
      set({
        status: 'unauthenticated',
        user: null,
        guestSession: null,
        pendingClaimGuestToken: null,
        pendingPhone: null,
        devOtpHint: null,
      });
    },
  };
});
