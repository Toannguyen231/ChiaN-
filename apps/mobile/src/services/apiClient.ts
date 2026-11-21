import { NativeModules, Platform } from 'react-native';
import type { ApiErrorResponse, AuthTokens, UserProfile } from '@chiane/shared';
import { tokenStorage } from './tokenStorage';

const DEV_FALLBACK_LAN_API_URL = 'http://192.168.1.160:3001';

function isExpoTunnelHost(host: string): boolean {
  return (
    host.endsWith('.exp.direct') ||
    host.endsWith('.on.expo.app') ||
    host.endsWith('.expo.dev')
  );
}

function resolveCandidateBaseUrls(): string[] {
  const explicitUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (explicitUrl) {
    return [explicitUrl];
  }

  // On physical iOS/Android devices running Expo Go, `localhost` points to the phone itself.
  // Extract the dev machine's LAN IP or Expo Tunnel origin from Metro's scriptURL.
  if (Platform.OS !== 'web') {
    const scriptURL: unknown = NativeModules?.SourceCode?.scriptURL;
    if (typeof scriptURL === 'string') {
      const match = scriptURL.match(/^(https?:\/\/([^:/]+)(?::\d+)?)/i);
      const origin = match?.[1]?.replace(/\/+$/, '');
      const host = match?.[2];
      if (origin && host && host !== 'localhost' && host !== '127.0.0.1') {
        if (isExpoTunnelHost(host)) {
          // 1) Proxy through Metro on the same Expo Tunnel origin (works over any Wi-Fi/4G once Metro loads metro.config.js)
          // 2) Fallback directly to dev machine LAN IP:3001 (works immediately on same Wi-Fi without restarting Metro)
          return [origin, DEV_FALLBACK_LAN_API_URL];
        }
        return [`http://${host}:3001`, origin];
      }
    }
  }

  return [
    Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001',
    DEV_FALLBACK_LAN_API_URL,
  ];
}

const CANDIDATE_BASE_URLS = resolveCandidateBaseUrls();
let activeBaseUrl = CANDIDATE_BASE_URLS[0];

export const API_BASE_URL = activeBaseUrl;

async function fetchFromApi(path: string, init: RequestInit): Promise<Response> {
  const orderedUrls = [
    activeBaseUrl,
    ...CANDIDATE_BASE_URLS.filter((url) => url !== activeBaseUrl),
  ];

  let lastError: unknown;
  for (let i = 0; i < orderedUrls.length; i++) {
    const baseUrl = orderedUrls[i];
    const hasMoreCandidates = i < orderedUrls.length - 1;
    try {
      const response = await fetch(`${baseUrl}${path}`, init);
      const contentType = response.headers.get('content-type') ?? '';
      // If an un-restarted Metro server returned its web HTML fallback instead of JSON API response, try next candidate
      if (hasMoreCandidates && contentType.includes('text/html')) {
        continue;
      }
      activeBaseUrl = baseUrl;
      return response;
    } catch (err) {
      lastError = err;
      if (!hasMoreCandidates) {
        throw err;
      }
    }
  }

  throw lastError ?? new Error('Network request failed');
}

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let refreshPromise: Promise<string | null> | null = null;
let onUnauthorizedCallback: (() => void) | null = null;

export function setOnUnauthorizedHandler(handler: () => void): void {
  onUnauthorizedCallback = handler;
}

async function performTokenRefresh(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const refreshToken = await tokenStorage.getRefreshToken();
    if (!refreshToken) {
      return null;
    }

    try {
      const response = await fetchFromApi('/api/v1/auth/refresh', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        await tokenStorage.clearTokens();
        onUnauthorizedCallback?.();
        return null;
      }

      const data = (await response.json()) as AuthTokens & { user: UserProfile };
      await tokenStorage.saveTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  authenticated?: boolean;
  retryOnAuth?: boolean;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    body,
    authenticated = false,
    retryOnAuth = true,
  } = options;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (authenticated) {
    const token = await tokenStorage.getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    } else {
      const guestSession = await tokenStorage.getGuestSession();
      if (guestSession?.guestToken) {
        headers['X-Guest-Token'] = guestSession.guestToken;
      }
    }
  }

  let response: Response;
  try {
    response = await fetchFromApi(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiClientError(
      0,
      'NETWORK_ERROR',
      'Không thể kết nối máy chủ. Kiểm tra mạng và thử lại nhé.'
    );
  }

  if (response.status === 401 && authenticated && retryOnAuth) {
    let errorCode = '';
    try {
      const cloned = (await response.clone().json()) as Partial<ApiErrorResponse>;
      errorCode = cloned.error?.code ?? '';
    } catch {
      // Ignore parse error
    }

    if (errorCode === 'TOKEN_EXPIRED' || errorCode === 'UNAUTHORIZED') {
      const nextAccessToken = await performTokenRefresh();
      if (nextAccessToken) {
        return apiRequest<T>(path, {
          ...options,
          retryOnAuth: false,
        });
      }
    }
  }

  if (!response.ok) {
    let payload: Partial<ApiErrorResponse> | null = null;
    try {
      payload = (await response.json()) as Partial<ApiErrorResponse>;
    } catch {
      payload = null;
    }

    throw new ApiClientError(
      response.status,
      payload?.error?.code ?? 'HTTP_ERROR',
      payload?.error?.message ?? `Yêu cầu thất bại (${response.status})`,
      payload?.error?.details
    );
  }

  return (await response.json()) as T;
}
