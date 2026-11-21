import React, { useCallback, useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  type CompositeNavigationProp,
} from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  formatVnd,
  type GroupSummaryDto,
  type PendingConfirmationBannerDto,
} from '@chiane/shared';
import IconBell from '../../../assets/figma/icon-bell.svg';
import IconChevron from '../../../assets/figma/icon-chevron.svg';
import {
  ChiaNeButton,
  GroupCard,
  GROUP_CATEGORY_META,
  IconOffline,
  ScreenContainer,
  StateView,
} from '../../components';
import type { AppStackParamList, MainTabParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { useAuthStore } from '../../store/authStore';
import { useGroupsStore } from '../../store/groupsStore';
import { useOfflineQueueStore } from '../../store/offlineQueueStore';
import { colors, fonts, radii, sizes, typography } from '../../theme/tokens';

type DashboardNav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'DashboardTab'>,
  NativeStackNavigationProp<AppStackParamList>
>;

function extractFirstName(displayName?: string | null): string {
  const trimmed = displayName?.trim();
  if (!trimmed) {
    return 'bạn';
  }
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1] || trimmed;
}

export function DashboardScreen() {
  const navigation = useNavigation<DashboardNav>();
  const user = useAuthStore((s) => s.user);
  const dashboard = useGroupsStore((s) => s.dashboard);
  const fetchDashboard = useGroupsStore((s) => s.fetchDashboard);
  const offlineCount = useOfflineQueueStore((s) => s.items.length);

  const [initialLoading, setInitialLoading] = useState(!dashboard);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else if (!useGroupsStore.getState().dashboard) {
        setInitialLoading(true);
      }
      setErrorText(null);
      try {
        await fetchDashboard();
      } catch (err) {
        setErrorText(
          err instanceof ApiClientError
            ? err.message
            : 'Không thể tải tổng quan. Vui lòng thử lại.'
        );
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [fetchDashboard]
  );

  useFocusEffect(
    useCallback(() => {
      void loadData(false);
      void useOfflineQueueStore.getState().hydrate();
    }, [loadData])
  );

  const recentGroups = dashboard?.recentGroups ?? [];
  const totalOwedToYouVnd = dashboard?.totalOwedToYouVnd ?? 0;
  const totalYouOweVnd = dashboard?.totalYouOweVnd ?? 0;
  const pendingConfirmationsCount = dashboard?.pendingConfirmationsCount ?? 0;
  const pendingConfirmations: PendingConfirmationBannerDto[] =
    dashboard?.pendingConfirmations ?? [];

  const handleQuickAddExpense = () => {
    if (recentGroups.length === 0) {
      navigation.navigate('CreateGroup');
      return;
    }
    if (recentGroups.length === 1) {
      navigation.navigate('AddExpense', { groupId: recentGroups[0]!.id });
      return;
    }
    setPickerVisible(true);
  };

  const handlePickGroup = (group: GroupSummaryDto) => {
    setPickerVisible(false);
    navigation.navigate('AddExpense', { groupId: group.id });
  };

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      edges={['top']}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadData(true)}
          tintColor={colors.forest}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerTextCol}>
          <Text style={styles.greeting}>Chào {extractFirstName(user?.displayName)},</Text>
          <Text style={styles.subtitle}>Hôm nay chia gì vui?</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hoạt động và nhắc nhẹ"
          hitSlop={8}
          onPress={() => navigation.navigate('ActivityTab')}
          style={({ pressed }) => [styles.bellButton, pressed && styles.pressed]}
        >
          <IconBell width={24} height={24} />
          {pendingConfirmationsCount > 0 ? <View style={styles.badgeDot} /> : null}
        </Pressable>
      </View>

      {initialLoading ? (
        <View style={styles.stateWrap}>
          <StateView kind="loading" title="Đang cập nhật tổng quan..." />
        </View>
      ) : errorText && !dashboard ? (
        <View style={styles.stateWrap}>
          <StateView
            kind="error"
            title="Chưa tải được dữ liệu"
            description={errorText}
            actionLabel="Thử lại"
            onAction={() => void loadData(false)}
          />
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>TỔNG QUAN CỦA BẠN</Text>
            <Text style={styles.heroHeading}>Mọi khoản, rõ ràng.</Text>
            <View style={styles.balanceColumns}>
              <View style={styles.balanceCol}>
                <Text style={styles.balanceLabel}>Bạn được nhận</Text>
                <Text style={styles.owedAmount} numberOfLines={1} adjustsFontSizeToFit>
                  {formatVnd(totalOwedToYouVnd)}
                </Text>
              </View>
              <View style={styles.balanceCol}>
                <Text style={styles.balanceLabel}>Bạn cần trả</Text>
                <Text style={styles.oweAmount} numberOfLines={1} adjustsFontSizeToFit>
                  {formatVnd(totalYouOweVnd)}
                </Text>
              </View>
            </View>
          </View>

          <ChiaNeButton
            label={recentGroups.length > 0 ? '+  Thêm khoản chi' : '+  Tạo nhóm đầu tiên'}
            variant="primary"
            onPress={handleQuickAddExpense}
          />

          {pendingConfirmations.map((item) => (
            <Pressable
              key={item.settlementId}
              accessibilityRole="button"
              onPress={() =>
                navigation.navigate('ConfirmPaymentReceived', {
                  settlementId: item.settlementId,
                })
              }
              style={({ pressed }) => [
                styles.pendingBanner,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.pendingBannerLeft}>
                <View style={styles.pendingPill}>
                  <Text style={styles.pendingPillText}>CHỜ XÁC NHẬN</Text>
                </View>
                <Text style={styles.pendingBannerTitle} numberOfLines={2}>
                  {`${item.fromName} vừa báo chuyển ${formatVnd(item.amountVnd)} trong ${item.groupName}`}
                </Text>
                <Text style={styles.pendingBannerSub}>
                  Bấm để kiểm tra & xác nhận đã nhận tiền
                </Text>
              </View>
              <IconChevron width={18} height={18} />
            </Pressable>
          ))}

          {offlineCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('OfflineSaved', {})}
              style={({ pressed }) => [styles.offlineBanner, pressed && styles.pressed]}
            >
              <IconOffline width={20} height={20} color={colors.purple} />
              <Text style={styles.offlineBannerText}>
                {`Có ${offlineCount} khoản chi đã lưu trên máy · Chạm để đồng bộ`}
              </Text>
              <IconChevron width={16} height={16} />
            </Pressable>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Nhóm gần đây</Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => navigation.navigate('GroupsTab')}
            >
              <Text style={styles.seeAll}>Xem tất cả</Text>
            </Pressable>
          </View>

          {recentGroups.length === 0 ? (
            <StateView
              kind="empty"
              title="Chưa có nhóm nào"
              description="Tạo một nhóm cho chuyến đi, bữa ăn hoặc nhà chung để bắt đầu chia tiền cùng bạn bè."
              actionLabel="Tạo nhóm mới"
              onAction={() => navigation.navigate('CreateGroup')}
            />
          ) : (
            <View style={styles.groupList}>
              {recentGroups.slice(0, 4).map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  subtitleMode="counts"
                  onPress={() =>
                    navigation.navigate('GroupDetails', { groupId: group.id })
                  }
                />
              ))}
            </View>
          )}

          <Text style={styles.footerQuote}>Một lời nhắc nhẹ, một tình bạn vui.</Text>
        </View>
      )}

      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerVisible(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Chọn nhóm để thêm khoản chi</Text>
            <View style={styles.modalList}>
              {recentGroups.map((group) => {
                const meta = GROUP_CATEGORY_META[group.category];
                const { Icon } = meta;
                return (
                  <Pressable
                    key={group.id}
                    onPress={() => handlePickGroup(group)}
                    style={({ pressed }) => [
                      styles.pickerRow,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.pickerBadge, { backgroundColor: meta.badgeBg }]}>
                      <Icon width={20} height={20} />
                    </View>
                    <View style={styles.pickerTextCol}>
                      <Text style={styles.pickerTitle} numberOfLines={1}>
                        {group.name}
                      </Text>
                      <Text style={styles.pickerSub}>
                        {group.memberCount} thành viên · {group.expenseCount} khoản chi
                      </Text>
                    </View>
                    <IconChevron width={18} height={18} />
                  </Pressable>
                );
              })}
            </View>
            <ChiaNeButton
              label="Đóng"
              variant="quiet"
              onPress={() => setPickerVisible(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 14,
  },
  headerTextCol: {
    flex: 1,
    gap: 2,
  },
  greeting: {
    fontFamily: fonts.bold,
    fontSize: 28,
    lineHeight: 38,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  bellButton: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  badgeDot: {
    position: 'absolute',
    top: 10,
    right: 0,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.coral,
    borderWidth: 1.5,
    borderColor: colors.paper,
  },
  pressed: {
    opacity: 0.75,
  },
  stateWrap: {
    marginTop: 20,
  },
  content: {
    gap: 16,
  },
  heroCard: {
    backgroundColor: colors.forest,
    borderRadius: radii.heroCard,
    padding: 20,
    minHeight: 190,
    justifyContent: 'space-between',
  },
  heroEyebrow: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    lineHeight: 15,
    color: colors.lime,
  },
  heroHeading: {
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 32,
    color: colors.white,
    marginTop: 4,
    marginBottom: 18,
  },
  balanceColumns: {
    flexDirection: 'row',
    gap: 16,
  },
  balanceCol: {
    flex: 1,
    gap: 6,
  },
  balanceLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.onForestLabel,
  },
  owedAmount: {
    fontFamily: fonts.bold,
    fontSize: 23,
    lineHeight: 33,
    color: colors.lime,
  },
  oweAmount: {
    fontFamily: fonts.bold,
    fontSize: 23,
    lineHeight: 33,
    color: colors.white,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 19,
    lineHeight: 28,
    color: colors.ink,
  },
  seeAll: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    lineHeight: 16,
    color: colors.ink,
  },
  groupList: {
    gap: 12,
  },
  footerQuote: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
    marginTop: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(23, 62, 50, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.white,
    borderRadius: radii.heroCard,
    padding: 22,
    gap: 14,
  },
  modalTitle: {
    ...typography.title,
    color: colors.ink,
  },
  modalList: {
    gap: 10,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radii.input,
    backgroundColor: colors.paper,
  },
  pickerBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerTextCol: {
    flex: 1,
    gap: 2,
  },
  pickerTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  pickerSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
  },
  offlineBanner: {
    backgroundColor: colors.lavender,
    borderRadius: radii.iconBadge,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  offlineBannerText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.purple,
  },
  pendingBanner: {
    backgroundColor: colors.lime,
    borderRadius: radii.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: colors.forest,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pendingBannerLeft: {
    flex: 1,
    gap: 4,
  },
  pendingPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.forest,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pendingPillText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.lime,
    letterSpacing: 0.4,
  },
  pendingBannerTitle: {
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
  pendingBannerSub: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.forest,
  },
});
