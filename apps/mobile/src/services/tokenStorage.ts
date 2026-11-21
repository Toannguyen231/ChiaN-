import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { GuestSessionDto } from '@chiane/shared';

const ACCESS_TOKEN_KEY = 'chiane.accessToken';
const REFRESH_TOKEN_KEY = 'chiane.refreshToken';
const GUEST_SESSION_KEY = 'chiane.guestSession';

interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getWebStorage(): WebStorageLike | null {
  const g = globalThis as { localStorage?: WebStorageLike };
  return g.localStorage ?? null;
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return getWebStorage()?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    getWebStorage()?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    getWebStorage()?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export const tokenStorage = {
  async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
    await Promise.all([
      setItem(ACCESS_TOKEN_KEY, accessToken),
      setItem(REFRESH_TOKEN_KEY, refreshToken),
    ]);
  },

  async getAccessToken(): Promise<string | null> {
    return getItem(ACCESS_TOKEN_KEY);
  },

  async getRefreshToken(): Promise<string | null> {
    return getItem(REFRESH_TOKEN_KEY);
  },

  async clearTokens(): Promise<void> {
    await Promise.all([
      removeItem(ACCESS_TOKEN_KEY),
      removeItem(REFRESH_TOKEN_KEY),
    ]);
  },

  async saveGuestSession(session: GuestSessionDto): Promise<void> {
    await setItem(GUEST_SESSION_KEY, JSON.stringify(session));
  },

  async getGuestSession(): Promise<GuestSessionDto | null> {
    const raw = await getItem(GUEST_SESSION_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as GuestSessionDto;
    } catch {
      return null;
    }
  },

  async clearGuestSession(): Promise<void> {
    await removeItem(GUEST_SESSION_KEY);
  },
};
