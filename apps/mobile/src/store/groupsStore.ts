import { create } from 'zustand';
import type { DashboardDto, GroupDetailDto, GroupSummaryDto } from '@chiane/shared';
import { groupsApi } from '../services/groupsApi';

interface GroupsState {
  dashboard: DashboardDto | null;
  activeGroups: GroupSummaryDto[];
  archivedGroups: GroupSummaryDto[];
  groupDetailsById: Record<string, GroupDetailDto>;
  dashboardLoading: boolean;
  groupsLoading: boolean;

  fetchDashboard: () => Promise<DashboardDto>;
  fetchGroups: (archived: boolean, search?: string) => Promise<GroupSummaryDto[]>;
  fetchGroupDetail: (groupId: string) => Promise<GroupDetailDto>;
  setGroupDetail: (group: GroupDetailDto) => void;
  clearStore: () => void;
}

export const useGroupsStore = create<GroupsState>((set) => ({
  dashboard: null,
  activeGroups: [],
  archivedGroups: [],
  groupDetailsById: {},
  dashboardLoading: false,
  groupsLoading: false,

  async fetchDashboard() {
    set({ dashboardLoading: true });
    try {
      const data = await groupsApi.getDashboard();
      set({
        dashboard: data,
        activeGroups: data.recentGroups,
      });
      return data;
    } finally {
      set({ dashboardLoading: false });
    }
  },

  async fetchGroups(archived: boolean, search?: string) {
    set({ groupsLoading: true });
    try {
      const { groups } = await groupsApi.listGroups({ archived, search });
      if (!search?.trim()) {
        if (archived) {
          set({ archivedGroups: groups });
        } else {
          set({ activeGroups: groups });
        }
      }
      return groups;
    } finally {
      set({ groupsLoading: false });
    }
  },

  async fetchGroupDetail(groupId: string) {
    const { group } = await groupsApi.getGroup(groupId);
    set((state) => ({
      groupDetailsById: {
        ...state.groupDetailsById,
        [groupId]: group,
      },
    }));
    return group;
  },

  setGroupDetail(group: GroupDetailDto) {
    set((state) => ({
      groupDetailsById: {
        ...state.groupDetailsById,
        [group.id]: group,
      },
    }));
  },

  clearStore() {
    set({
      dashboard: null,
      activeGroups: [],
      archivedGroups: [],
      groupDetailsById: {},
    });
  },
}));
