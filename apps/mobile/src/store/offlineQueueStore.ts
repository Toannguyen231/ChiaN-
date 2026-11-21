import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  SyncExpensePayload,
  SyncMutationItem,
  SyncMutationResultDto,
} from '@chiane/shared';
import { create } from 'zustand';
import { apiRequest } from '../services/apiClient';

const STORAGE_KEY = 'chiane.offlineMutations.v1';

export interface QueuedExpenseMutation {
  clientMutationId: string;
  groupId: string;
  groupName: string;
  payload: SyncExpensePayload;
  queuedAt: string;
  lastError?: string | null;
}

interface OfflineQueueState {
  items: QueuedExpenseMutation[];
  hydrated: boolean;
  syncing: boolean;

  hydrate: () => Promise<void>;
  enqueueExpense: (input: {
    groupId: string;
    groupName: string;
    payload: SyncExpensePayload;
    clientMutationId?: string;
  }) => Promise<QueuedExpenseMutation>;
  removeItem: (clientMutationId: string) => Promise<void>;
  clearAll: () => Promise<void>;
  syncAll: () => Promise<{ syncedCount: number; remainingCount: number }>;
}

async function persistItems(items: QueuedExpenseMutation[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export const useOfflineQueueStore = create<OfflineQueueState>((set, get) => ({
  items: [],
  hydrated: false,
  syncing: false,

  async hydrate() {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as QueuedExpenseMutation[]) : [];
      set({
        items: Array.isArray(parsed) ? parsed : [],
        hydrated: true,
      });
    } catch {
      set({ items: [], hydrated: true });
    }
  },

  async enqueueExpense({ groupId, groupName, payload, clientMutationId }) {
    await get().hydrate();
    const mutationId =
      clientMutationId ??
      `chiane_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const nextItem: QueuedExpenseMutation = {
      clientMutationId: mutationId,
      groupId,
      groupName,
      payload,
      queuedAt: new Date().toISOString(),
      lastError: null,
    };

    const existing = get().items.filter((i) => i.clientMutationId !== mutationId);
    const next = [nextItem, ...existing];
    set({ items: next });
    await persistItems(next);
    return nextItem;
  },

  async removeItem(clientMutationId) {
    const next = get().items.filter((i) => i.clientMutationId !== clientMutationId);
    set({ items: next });
    await persistItems(next);
  },

  async clearAll() {
    set({ items: [] });
    await AsyncStorage.removeItem(STORAGE_KEY);
  },

  async syncAll() {
    await get().hydrate();
    const current = get().items;
    if (current.length === 0 || get().syncing) {
      return { syncedCount: 0, remainingCount: current.length };
    }

    set({ syncing: true });
    try {
      const mutations: SyncMutationItem[] = current.map((item) => ({
        clientMutationId: item.clientMutationId,
        type: 'CREATE_EXPENSE',
        groupId: item.groupId,
        payload: item.payload,
      }));

      const res = await apiRequest<{ results: SyncMutationResultDto[] }>(
        '/api/v1/sync/mutations',
        {
          method: 'POST',
          body: { mutations },
          authenticated: true,
        }
      );

      const byId = new Map(res.results.map((r) => [r.clientMutationId, r]));
      const remaining: QueuedExpenseMutation[] = [];
      let syncedCount = 0;

      for (const item of current) {
        const result = byId.get(item.clientMutationId);
        if (
          result &&
          (result.status === 'SYNCED' || result.status === 'ALREADY_SYNCED')
        ) {
          syncedCount += 1;
        } else {
          remaining.push({
            ...item,
            lastError: result?.errorMessage ?? 'Không thể đồng bộ lúc này.',
          });
        }
      }

      set({ items: remaining });
      await persistItems(remaining);
      return { syncedCount, remainingCount: remaining.length };
    } finally {
      set({ syncing: false });
    }
  },
}));
