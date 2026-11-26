import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { GroupCategory } from '@chiane/shared';
import {
  AppHeader,
  ChiaNeButton,
  ChiaNeChip,
  ChiaNeInput,
  ConfirmDialog,
  InfoCard,
  ScreenContainer,
  showToast,
  StateView,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { groupsApi } from '../../services/groupsApi';
import { useGroupsStore } from '../../store/groupsStore';
import { colors, fonts, radii } from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'GroupSettings'>;

const CATEGORIES: Array<{ key: GroupCategory; label: string }> = [
  { key: 'TRAVEL', label: 'Du lịch' },
  { key: 'FOOD', label: 'Ăn uống' },
  { key: 'HOUSEHOLD', label: 'Nhà chung' },
  { key: 'OTHER', label: 'Khác' },
];

export function GroupSettingsScreen({ navigation, route }: Props) {
  const { groupId } = route.params;
  const cachedGroup = useGroupsStore((s) => s.groupDetailsById[groupId]);
  const fetchGroupDetail = useGroupsStore((s) => s.fetchGroupDetail);
  const setGroupDetail = useGroupsStore((s) => s.setGroupDetail);

  const [group, setGroup] = useState(cachedGroup ?? null);
  const [name, setName] = useState(cachedGroup?.name ?? '');
  const [category, setCategory] = useState<GroupCategory>(
    cachedGroup?.category ?? 'TRAVEL'
  );
  const [loading, setLoading] = useState(!cachedGroup);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadGroup = useCallback(async () => {
    try {
      const detail = await fetchGroupDetail(groupId);
      setGroup(detail);
      setName(detail.name);
      setCategory(detail.category);
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError ? err.message : 'Không thể tải cài đặt nhóm.'
      );
    } finally {
      setLoading(false);
    }
  }, [fetchGroupDetail, groupId]);

  useFocusEffect(
    useCallback(() => {
      void loadGroup();
    }, [loadGroup])
  );

  const isAdmin = group?.myRole === 'ADMIN';

  const handleSave = async () => {
    if (!group || !isAdmin) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setErrorText('Tên nhóm không được để trống.');
      return;
    }
    setSaving(true);
    setErrorText(null);
    setStatusMessage(null);
    try {
      const res = await groupsApi.updateGroup(group.id, {
        name: trimmed,
        category,
      });
      setGroup(res.group);
      setGroupDetail(res.group);
      setStatusMessage('Đã lưu thay đổi nhóm.');
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError ? err.message : 'Không thể cập nhật nhóm.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveToggle = async () => {
    if (!group) return;
    setActionLoading(true);
    setErrorText(null);
    try {
      const res = await groupsApi.archiveGroup(group.id, !group.isArchived);
      setGroup(res.group);
      setGroupDetail(res.group);
      setArchiveConfirm(false);
      setStatusMessage(
        res.group.isArchived
          ? 'Nhóm đã được chuyển vào mục Đã lưu trữ.'
          : 'Nhóm đã được khôi phục về Đang hoạt động.'
      );
    } catch (err) {
      setArchiveConfirm(false);
      setErrorText(
        err instanceof ApiClientError ? err.message : 'Không thể cập nhật lưu trữ.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!group || actionLoading) return;
    setActionLoading(true);
    setErrorText(null);
    try {
      await groupsApi.deleteGroup(group.id);
      useGroupsStore.setState(state => {
        const groupDetailsById = { ...state.groupDetailsById };
        delete groupDetailsById[group.id];
        return { groupDetailsById, dashboard: null,
          activeGroups: state.activeGroups.filter(g => g.id !== group.id),
          archivedGroups: state.archivedGroups.filter(g => g.id !== group.id) };
      });
      showToast('Đã xóa nhóm vĩnh viễn.');
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'GroupsTab' } }] });
    } catch (err) {
      setErrorText(err instanceof ApiClientError ? err.message : 'Không thể xóa nhóm lúc này.');
    } finally {
      setDeleteConfirm(false);
      setActionLoading(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!group) return;
    setActionLoading(true);
    setErrorText(null);
    try {
      await groupsApi.leaveGroup(group.id);
      setLeaveConfirm(false);
      navigation.navigate('MainTabs', { screen: 'GroupsTab' });
    } catch (err) {
      setLeaveConfirm(false);
      setErrorText(
        err instanceof ApiClientError ? err.message : 'Không thể rời nhóm lúc này.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      header={<AppHeader title="Cài đặt nhóm" onBack={() => navigation.goBack()} />}
    >
      {loading && !group ? (
        <StateView kind="loading" title="Đang tải cài đặt..." />
      ) : !group ? (
        <StateView
          kind="error"
          title="Không tải được cài đặt"
          description={errorText ?? undefined}
          actionLabel="Thử lại"
          onAction={() => void loadGroup()}
        />
      ) : (
        <View style={styles.content}>
          {errorText ? (
            <InfoCard tone="peach">
              <Text style={styles.errorBanner}>{errorText}</Text>
            </InfoCard>
          ) : null}

          {statusMessage ? (
            <InfoCard tone="lime">
              <Text style={styles.successBanner}>{statusMessage}</Text>
            </InfoCard>
          ) : null}

          {!isAdmin ? (
            <InfoCard tone="lavender">
              <Text style={styles.roleNote}>
                Chỉ trưởng nhóm mới có quyền đổi tên, phân loại hoặc lưu trữ nhóm.
              </Text>
            </InfoCard>
          ) : null}

          <ChiaNeInput
            label="Tên nhóm"
            value={name}
            onChangeText={setName}
            editable={isAdmin && !group.isArchived}
            maxLength={80}
          />

          <Text style={styles.sectionLabel}>Phân loại nhóm</Text>
          <View style={styles.chipsWrap}>
            {CATEGORIES.map((item) => (
              <ChiaNeChip
                key={item.key}
                label={item.label}
                active={category === item.key}
                onPress={
                  isAdmin && !group.isArchived
                    ? () => setCategory(item.key)
                    : undefined
                }
              />
            ))}
          </View>

          {isAdmin && !group.isArchived ? (
            <ChiaNeButton
              label="Lưu thông tin nhóm"
              variant="primary"
              loading={saving}
              onPress={() => void handleSave()}
            />
          ) : null}

          <View style={styles.card}>
            <Pressable
              onPress={() =>
                navigation.navigate('InviteFriends', { groupId: group.id })
              }
              style={styles.actionRow}
            >
              <Text style={styles.actionRowText}>Quản lý liên kết mời bạn bè</Text>
            </Pressable>
            {isAdmin ? (
              <>
                <View style={styles.divider} />
                <Pressable
                  onPress={() => setArchiveConfirm(true)}
                  style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
                >
                  <Text style={styles.actionRowText}>
                    {group.isArchived ? 'Khôi phục nhóm' : 'Lưu trữ nhóm'}
                  </Text>
                </Pressable>
                <View style={styles.divider} />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setDeleteConfirm(true)}
                  style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
                >
                  <Text style={styles.dangerActionText}>Xóa nhóm vĩnh viễn</Text>
                </Pressable>
              </>
            ) : null}
          </View>

          {group.myRole !== 'GUEST' ? (
            <ChiaNeButton
              label="Rời khỏi nhóm"
              variant="quiet"
              onPress={() => setLeaveConfirm(true)}
            />
          ) : null}
        </View>
      )}

      <ConfirmDialog visible={deleteConfirm} title={`Xóa nhóm ${group?.name ?? ''}?`}
        description="Tất cả khoản chi, thanh toán và lịch sử của nhóm sẽ bị xóa vĩnh viễn. Bạn không thể khôi phục nhóm sau bước này."
        confirmLabel="Xóa nhóm vĩnh viễn" destructive loading={actionLoading}
        onConfirm={() => void handleDeleteGroup()} onCancel={() => setDeleteConfirm(false)} />

      <ConfirmDialog
        visible={archiveConfirm}
        title={group?.isArchived ? 'Khôi phục nhóm?' : 'Lưu trữ nhóm?'}
        description={
          group?.isArchived
            ? 'Nhóm sẽ hoạt động lại bình thường và cho phép ghi thêm khoản chi.'
            : 'Nhóm đã lưu trữ sẽ chuyển sang chế độ chỉ xem. Bạn vẫn có thể khôi phục bất kỳ lúc nào.'
        }
        confirmLabel={group?.isArchived ? 'Khôi phục' : 'Lưu trữ nhóm'}
        loading={actionLoading}
        onConfirm={() => void handleArchiveToggle()}
        onCancel={() => setArchiveConfirm(false)}
      />

      <ConfirmDialog
        visible={leaveConfirm}
        title="Rời khỏi nhóm?"
        description="Bạn chỉ có thể rời nhóm khi số dư của bạn trong nhóm bằng 0 ₫. Nếu bạn là trưởng nhóm duy nhất, quyền sẽ tự chuyển cho thành viên tiếp theo."
        confirmLabel="Xác nhận rời nhóm"
        destructive
        loading={actionLoading}
        onConfirm={() => void handleLeaveGroup()}
        onCancel={() => setLeaveConfirm(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingTop: 8,
  },
  sectionLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.ink,
    marginBottom: -4,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  errorBanner: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.coral,
  },
  successBanner: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.forest,
  },
  roleNote: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.purple,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    paddingHorizontal: 18,
  },
  actionRow: {
    minHeight: 54,
    justifyContent: 'center',
  },
  actionRowText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  dangerActionText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.coral,
  },
  pressed: {
    opacity: 0.75,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
  },
});
