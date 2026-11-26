import React, { useCallback, useMemo, useState } from 'react';
import {
  Platform,
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
  type ActivityItemDto,
  type GroupCategory,
  type GroupSummaryDto,
  type PendingConfirmationBannerDto,
} from '@chiane/shared';
import IconBank from '../../../assets/figma/icon-bank.svg';
import IconBell from '../../../assets/figma/icon-bell.svg';
import IconCheckDark from '../../../assets/figma/icon-check-dark.svg';
import IconChevron from '../../../assets/figma/icon-chevron.svg';
import IconLink from '../../../assets/figma/icon-link.svg';
import IconPlus from '../../../assets/figma/icon-plus.svg';
import IconReceipt from '../../../assets/figma/icon-receipt.svg';
import {
  AnimatedNumber,
  AvatarBadge,
  BottomSheetModal,
  ChiaNeButton,
  DashboardSkeleton,
  FadeSlideIn,
  GroupCard,
  GROUP_CATEGORY_META,
  IconClock,
  IconOffline,
  InviteLinkModal,
  ScalePressable,
  ScreenContainer,
  showToast,
  StateView,
} from '../../components';
import type { AppStackParamList, MainTabParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { settlementsApi } from '../../services/settlementsApi';
import { useAuthStore } from '../../store/authStore';
import { useGroupsStore } from '../../store/groupsStore';
import { useOfflineQueueStore } from '../../store/offlineQueueStore';
import {
  colors,
  fonts,
  radii,
  shadows,
  sizes,
  tabularNums,
} from '../../theme/tokens';

type DashboardNav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'DashboardTab'>,
  NativeStackNavigationProp<AppStackParamList>
>;

type PickerMode = 'EXPENSE' | 'SCAN_AI';

const QUICK_GROUP_TEMPLATES: Array<{
  category: GroupCategory;
  emoji: string;
  label: string;
  suggestedName: string;
}> = [
  {
    category: 'FOOD',
    emoji: '🍜',
    label: 'Ăn uống cùng hội',
    suggestedName: 'Ăn uống hội bạn',
  },
  {
    category: 'TRAVEL',
    emoji: '✈️',
    label: 'Chuyến đi cuối tuần',
    suggestedName: 'Chuyến đi cuối tuần',
  },
  {
    category: 'HOUSEHOLD',
    emoji: '🏠',
    label: 'Chi tiêu nhà chung',
    suggestedName: 'Nhà chung mình',
  },
];

function extractFirstName(displayName?: string | null): string {
  const trimmed = displayName?.trim();
  if (!trimmed) {
    return 'bạn';
  }
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1] || trimmed;
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'Chào buổi sáng';
  if (hour >= 11 && hour < 14) return 'Chào buổi trưa';
  if (hour >= 14 && hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return 'Vừa xong';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Hôm qua';
  if (days < 7) return `${days} ngày trước`;
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, '0')}`;
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
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [bankBannerDismissed, setBankBannerDismissed] = useState(false);

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

  const recentGroups = useMemo(
    () => dashboard?.recentGroups ?? [],
    [dashboard?.recentGroups]
  );
  const totalOwedToYouVnd = dashboard?.totalOwedToYouVnd ?? 0;
  const totalYouOweVnd = dashboard?.totalYouOweVnd ?? 0;
  const pendingConfirmationsCount = dashboard?.pendingConfirmationsCount ?? 0;
  const pendingConfirmations: PendingConfirmationBannerDto[] =
    dashboard?.pendingConfirmations ?? [];
  const recentActivities: ActivityItemDto[] = dashboard?.recentActivities ?? [];

  const hasBankSetup = Boolean(user?.bankBin && user?.bankAccountNumber);
  const netBalanceVnd = totalOwedToYouVnd - totalYouOweVnd;

  const topOweGroup = useMemo(() => {
    const owing = recentGroups.filter((g) => g.myBalanceVnd < 0);
    if (owing.length === 0) return null;
    return owing.sort((a, b) => a.myBalanceVnd - b.myBalanceVnd)[0] ?? null;
  }, [recentGroups]);

  const topReceivableGroup = useMemo(() => {
    const receivable = recentGroups.filter((g) => g.myBalanceVnd > 0);
    if (receivable.length === 0) return null;
    return receivable.sort((a, b) => b.myBalanceVnd - a.myBalanceVnd)[0] ?? null;
  }, [recentGroups]);

  const handleQuickExpenseFlow = (mode: PickerMode) => {
    if (recentGroups.length === 0) {
      showToast({
        message: 'Tạo nhóm đầu tiên để bắt đầu ghi chi tiêu nhé!',
        tone: 'info',
      });
      navigation.navigate('CreateGroup');
      return;
    }
    if (recentGroups.length === 1) {
      navigation.navigate('AddExpense', {
        groupId: recentGroups[0]!.id,
        ...(mode === 'SCAN_AI' ? { autoScanReceipt: true } : {}),
      });
      return;
    }
    setPickerMode(mode);
  };

  const handlePickGroup = (group: GroupSummaryDto) => {
    const mode = pickerMode;
    setPickerMode(null);
    const go = () =>
      navigation.navigate('AddExpense', {
        groupId: group.id,
        ...(mode === 'SCAN_AI' ? { autoScanReceipt: true } : {}),
      });
    if (Platform.OS === 'ios') {
      setTimeout(go, 220);
    } else {
      go();
    }
  };

  const handleTapHeroReceivable = () => {
    if (topReceivableGroup) {
      navigation.navigate('GroupDetails', {
        groupId: topReceivableGroup.id,
        initialTab: 'BALANCES',
      });
    } else {
      showToast({
        message: 'Hiện chưa có khoản nào bạn cần thu từ hội bạn.',
        tone: 'info',
      });
    }
  };

  const handleTapHeroOwe = () => {
    if (topOweGroup) {
      navigation.navigate('GroupDetails', {
        groupId: topOweGroup.id,
        initialTab: 'BALANCES',
      });
    } else {
      showToast({
        message: 'Bạn không nợ khoản nào, thật thảnh thơi!',
        tone: 'success',
      });
    }
  };

  const handleTapActivity = async (item: ActivityItemDto) => {
    if (item.metadata?.expenseId && item.type !== 'EXPENSE_DELETED') {
      navigation.navigate('ExpenseDetails', {
        expenseId: item.metadata.expenseId,
      });
      return;
    }

    if (item.metadata?.settlementId) {
      if (item.type === 'SETTLEMENT_CONFIRMED') {
        navigation.navigate('PaymentCompleted', {
          settlementId: item.metadata.settlementId,
        });
        return;
      }
      if (item.type === 'SETTLEMENT_REPORTED') {
        try {
          const { settlement } = await settlementsApi.getSettlement(
            item.metadata.settlementId
          );
          navigation.navigate(
            settlement.canConfirm
              ? 'ConfirmPaymentReceived'
              : 'WaitingConfirmation',
            { settlementId: settlement.id }
          );
          return;
        } catch {
          // fallback to group balances tab
        }
      }
      navigation.navigate('GroupDetails', {
        groupId: item.groupId,
        initialTab: 'BALANCES',
      });
      return;
    }

    navigation.navigate('GroupDetails', { groupId: item.groupId });
  };

  const renderActivityIcon = (item: ActivityItemDto) => {
    switch (item.type) {
      case 'SETTLEMENT_REPORTED':
      case 'SETTLEMENT_REJECTED':
        return (
          <View style={[styles.actBadge, { backgroundColor: colors.peach }]}>
            <IconClock width={18} height={18} color={colors.coral} />
          </View>
        );
      case 'SETTLEMENT_CONFIRMED':
        return (
          <View style={[styles.actBadge, { backgroundColor: colors.lime }]}>
            <IconCheckDark width={18} height={18} />
          </View>
        );
      case 'REMINDER_SENT':
        return (
          <View style={[styles.actBadge, { backgroundColor: colors.peach }]}>
            <IconBell width={18} height={18} />
          </View>
        );
      case 'GROUP_CREATED':
      case 'MEMBER_JOINED':
      case 'MEMBER_LEFT':
      case 'MEMBER_REMOVED':
        return (
          <View style={[styles.actBadge, { backgroundColor: colors.sage }]}>
            <IconLink width={18} height={18} />
          </View>
        );
      default:
        return (
          <View style={[styles.actBadge, { backgroundColor: colors.lavender }]}>
            <IconReceipt width={18} height={18} />
          </View>
        );
    }
  };

  const heroStatusBadge =
    totalOwedToYouVnd === 0 && totalYouOweVnd === 0
      ? {
          text: 'Đang cân bằng ✓',
          bg: 'rgba(208, 244, 119, 0.2)',
          color: colors.lime,
        }
      : netBalanceVnd >= 0
        ? {
            text: `Tổng ròng +${formatVnd(netBalanceVnd)}`,
            bg: colors.lime,
            color: colors.forest,
          }
        : {
            text: `Cần trả ròng ${formatVnd(Math.abs(netBalanceVnd))}`,
            bg: colors.peach,
            color: colors.coral,
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
        <ScalePressable
          accessibilityRole="button"
          accessibilityLabel="Mở tài khoản cá nhân"
          onPress={() => navigation.navigate('AccountTab')}
          scaleTo={0.96}
          style={styles.headerLeft}
        >
          <AvatarBadge name={user?.displayName} size={44} highlight />
          <View style={styles.headerTextCol}>
            <Text style={styles.greetingSub}>{getTimeGreeting()},</Text>
            <Text style={styles.greetingName} numberOfLines={1}>
              {extractFirstName(user?.displayName)} 👋
            </Text>
          </View>
        </ScalePressable>

        <ScalePressable
          accessibilityRole="button"
          accessibilityLabel="Hoạt động và nhắc nhẹ"
          hitSlop={8}
          onPress={() => navigation.navigate('ActivityTab')}
          scaleTo={0.93}
          style={styles.bellButton}
        >
          <IconBell width={22} height={22} />
          {pendingConfirmationsCount > 0 ? (
            <View style={styles.badgeCountPill}>
              <Text style={styles.badgeCountText}>
                {pendingConfirmationsCount > 9 ? '9+' : pendingConfirmationsCount}
              </Text>
            </View>
          ) : null}
        </ScalePressable>
      </View>

      {initialLoading ? (
        <View style={styles.stateWrap}>
          <DashboardSkeleton />
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
          {/* Hero Balance Card */}
          <FadeSlideIn index={0}>
            <View style={styles.heroCard}>
              <View pointerEvents="none" style={styles.heroGlowLarge} />
              <View pointerEvents="none" style={styles.heroGlowSmall} />

              <View style={styles.heroTopRow}>
                <Text style={styles.heroEyebrow}>TỔNG QUAN CỦA BẠN</Text>
                <View
                  style={[
                    styles.heroStatusPill,
                    { backgroundColor: heroStatusBadge.bg },
                  ]}
                >
                  <Text
                    style={[
                      styles.heroStatusText,
                      tabularNums,
                      { color: heroStatusBadge.color },
                    ]}
                  >
                    {heroStatusBadge.text}
                  </Text>
                </View>
              </View>

              <Text style={styles.heroHeading}>Mọi khoản, rõ ràng.</Text>

              <View style={styles.balanceColumns}>
                <ScalePressable
                  accessibilityRole="button"
                  onPress={handleTapHeroReceivable}
                  scaleTo={0.97}
                  style={styles.balanceTile}
                >
                  <View style={styles.balanceLabelRow}>
                    <Text style={styles.balanceLabel}>Bạn được nhận</Text>
                    {topReceivableGroup ? (
                      <Text style={styles.balanceHint}>Xem ›</Text>
                    ) : null}
                  </View>
                  <AnimatedNumber
                    value={totalOwedToYouVnd}
                    style={styles.owedAmount}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  />
                </ScalePressable>

                <ScalePressable
                  accessibilityRole="button"
                  onPress={handleTapHeroOwe}
                  scaleTo={0.97}
                  style={styles.balanceTile}
                >
                  <View style={styles.balanceLabelRow}>
                    <Text style={styles.balanceLabel}>Bạn cần trả</Text>
                    {topOweGroup ? (
                      <Text style={styles.balanceHint}>Trả ›</Text>
                    ) : null}
                  </View>
                  <AnimatedNumber
                    value={totalYouOweVnd}
                    style={styles.oweAmount}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  />
                </ScalePressable>
              </View>
            </View>
          </FadeSlideIn>

          {/* 4-Column Quick Actions Grid */}
          <FadeSlideIn index={1}>
            <View style={styles.quickGrid}>
              <ScalePressable
                accessibilityRole="button"
                onPress={() => handleQuickExpenseFlow('EXPENSE')}
                scaleTo={0.95}
                style={styles.quickActionItem}
              >
                <View style={[styles.quickIconBox, { backgroundColor: colors.forest }]}>
                  <Text style={styles.quickEmojiLight}>＋</Text>
                </View>
                <Text style={styles.quickLabel} numberOfLines={1}>
                  Ghi chi tiêu
                </Text>
              </ScalePressable>

              <ScalePressable
                accessibilityRole="button"
                onPress={() => handleQuickExpenseFlow('SCAN_AI')}
                scaleTo={0.95}
                style={styles.quickActionItem}
              >
                <View style={[styles.quickIconBox, { backgroundColor: colors.lime }]}>
                  <Text style={styles.quickEmoji}>📷</Text>
                </View>
                <Text style={styles.quickLabel} numberOfLines={1}>
                  Quét bill AI
                </Text>
              </ScalePressable>

              <ScalePressable
                accessibilityRole="button"
                onPress={() => navigation.navigate('CreateGroup')}
                scaleTo={0.95}
                style={styles.quickActionItem}
              >
                <View style={[styles.quickIconBox, { backgroundColor: colors.lavender }]}>
                  <Text style={styles.quickEmoji}>👥</Text>
                </View>
                <Text style={styles.quickLabel} numberOfLines={1}>
                  Tạo nhóm
                </Text>
              </ScalePressable>

              <ScalePressable
                accessibilityRole="button"
                onPress={() => setInviteModalVisible(true)}
                scaleTo={0.95}
                style={styles.quickActionItem}
              >
                <View style={[styles.quickIconBox, { backgroundColor: colors.peach }]}>
                  <Text style={styles.quickEmoji}>🔗</Text>
                </View>
                <Text style={styles.quickLabel} numberOfLines={1}>
                  Vào nhóm
                </Text>
              </ScalePressable>
            </View>
          </FadeSlideIn>

          {/* Actionable Banners: Pending Confirmations, Quick Settle, Bank VietQR, Offline */}
          {pendingConfirmations.map((item, idx) => (
            <FadeSlideIn key={item.settlementId} index={2 + idx}>
              <ScalePressable
                accessibilityRole="button"
                onPress={() =>
                  navigation.navigate('ConfirmPaymentReceived', {
                    settlementId: item.settlementId,
                  })
                }
                scaleTo={0.98}
                style={styles.pendingBanner}
              >
                <View style={styles.pendingBannerLeft}>
                  <View style={styles.pendingPill}>
                    <Text style={styles.pendingPillText}>CHỜ XÁC NHẬN</Text>
                  </View>
                  <Text style={styles.pendingBannerTitle} numberOfLines={2}>
                    {`${item.fromName} vừa báo chuyển ${formatVnd(item.amountVnd)} trong ${item.groupName}`}
                  </Text>
                  <Text style={styles.pendingBannerSub}>
                    Chạm để kiểm tra & xác nhận đã nhận tiền
                  </Text>
                </View>
                <IconChevron width={18} height={18} />
              </ScalePressable>
            </FadeSlideIn>
          ))}

          {topOweGroup ? (
            <FadeSlideIn index={2}>
              <ScalePressable
                accessibilityRole="button"
                onPress={() =>
                  navigation.navigate('GroupDetails', {
                    groupId: topOweGroup.id,
                    initialTab: 'BALANCES',
                  })
                }
                scaleTo={0.98}
                style={styles.quickSettleCard}
              >
                <View style={styles.quickSettleBadge}>
                  <Text style={styles.quickSettleEmoji}>💸</Text>
                </View>
                <View style={styles.quickSettleCol}>
                  <Text style={styles.quickSettleEyebrow}>CẦN THANH TOÁN NHANH</Text>
                  <Text style={styles.quickSettleTitle} numberOfLines={1}>
                    {`${topOweGroup.name} · ${formatVnd(Math.abs(topOweGroup.myBalanceVnd))}`}
                  </Text>
                </View>
                <View style={styles.quickSettleAction}>
                  <Text style={styles.quickSettleActionText}>Trả ngay</Text>
                </View>
              </ScalePressable>
            </FadeSlideIn>
          ) : null}

          {!hasBankSetup && !bankBannerDismissed ? (
            <FadeSlideIn index={3}>
              <View style={styles.bankSetupCard}>
                <ScalePressable
                  accessibilityRole="button"
                  onPress={() => navigation.navigate('BankAccount')}
                  scaleTo={0.98}
                  style={styles.bankSetupMain}
                >
                  <View style={styles.bankIconWrap}>
                    <IconBank width={22} height={22} />
                  </View>
                  <View style={styles.bankSetupTextCol}>
                    <Text style={styles.bankSetupTitle}>
                      Thêm tài khoản nhận VietQR
                    </Text>
                    <Text style={styles.bankSetupSub}>
                      Bạn bè có thể quét VietQR để điền sẵn thông tin chuyển khoản.
                    </Text>
                  </View>
                  <IconChevron width={16} height={16} />
                </ScalePressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setBankBannerDismissed(true)}
                  hitSlop={8}
                  style={styles.bankDismissBtn}
                >
                  <Text style={styles.bankDismissText}>Để sau</Text>
                </Pressable>
              </View>
            </FadeSlideIn>
          ) : null}

          {offlineCount > 0 ? (
            <FadeSlideIn index={3}>
              <ScalePressable
                accessibilityRole="button"
                onPress={() => navigation.navigate('OfflineSaved', {})}
                scaleTo={0.98}
                style={styles.offlineBanner}
              >
                <IconOffline width={20} height={20} color={colors.purple} />
                <Text style={styles.offlineBannerText}>
                  {`Có ${offlineCount} khoản chi đã lưu trên máy · Chạm để đồng bộ`}
                </Text>
                <IconChevron width={16} height={16} />
              </ScalePressable>
            </FadeSlideIn>
          ) : null}

          {/* Recent Groups Section */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Nhóm gần đây</Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => navigation.navigate('GroupsTab')}
            >
              <Text style={styles.seeAll}>Xem tất cả ›</Text>
            </Pressable>
          </View>

          {recentGroups.length === 0 ? (
            <FadeSlideIn index={4}>
              <View style={styles.smartEmptyCard}>
                <Text style={styles.smartEmptyTitle}>
                  Bắt đầu nhóm đầu tiên chỉ trong 5 giây ✨
                </Text>
                <Text style={styles.smartEmptySub}>
                  Chọn nhanh mẫu bên dưới hoặc dán liên kết mời từ hội bạn.
                </Text>

                <View style={styles.templateList}>
                  {QUICK_GROUP_TEMPLATES.map((tpl) => (
                    <ScalePressable
                      key={tpl.category}
                      accessibilityRole="button"
                      onPress={() =>
                        navigation.navigate('CreateGroup', {
                          initialCategory: tpl.category,
                          initialName: tpl.suggestedName,
                        })
                      }
                      scaleTo={0.97}
                      style={styles.templatePill}
                    >
                      <Text style={styles.templateEmoji}>{tpl.emoji}</Text>
                      <Text style={styles.templateText}>{tpl.label}</Text>
                      <IconPlus width={16} height={16} />
                    </ScalePressable>
                  ))}
                </View>

                <ChiaNeButton
                  label="Dán liên kết mời từ bạn bè"
                  variant="quiet"
                  onPress={() => setInviteModalVisible(true)}
                />
              </View>
            </FadeSlideIn>
          ) : (
            <View style={styles.groupList}>
              {recentGroups.slice(0, 4).map((group, idx) => (
                <FadeSlideIn key={group.id} index={3 + idx}>
                  <GroupCard
                    group={group}
                    subtitleMode="counts"
                    onPress={() =>
                      navigation.navigate('GroupDetails', { groupId: group.id })
                    }
                  />
                </FadeSlideIn>
              ))}
            </View>
          )}

          {/* Recent Activities Section (reuses recentActivities from GET /api/v1/dashboard) */}
          {recentActivities.length > 0 ? (
            <View style={styles.activitiesSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Hoạt động mới nhất</Text>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => navigation.navigate('ActivityTab')}
                >
                  <Text style={styles.seeAll}>Xem tất cả ›</Text>
                </Pressable>
              </View>

              <View style={styles.activitiesCard}>
                {recentActivities.slice(0, 5).map((item, idx) => (
                  <React.Fragment key={item.id}>
                    {idx > 0 ? <View style={styles.divider} /> : null}
                    <ScalePressable
                      accessibilityRole="button"
                      onPress={() => void handleTapActivity(item)}
                      scaleTo={0.99}
                      style={styles.actRow}
                    >
                      {renderActivityIcon(item)}
                      <View style={styles.actTextCol}>
                        <Text style={styles.actTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.actMeta} numberOfLines={1}>
                          {`${item.groupName} · ${formatRelativeTime(item.createdAt)}`}
                        </Text>
                      </View>
                      <IconChevron width={16} height={16} />
                    </ScalePressable>
                  </React.Fragment>
                ))}
              </View>
            </View>
          ) : null}

          <Text style={styles.footerQuote}>Một lời nhắc nhẹ, một tình bạn vui.</Text>
        </View>
      )}

      <BottomSheetModal
        visible={pickerMode !== null}
        onClose={() => setPickerMode(null)}
        title={
          pickerMode === 'SCAN_AI'
            ? 'Chọn nhóm để quét hóa đơn AI'
            : 'Chọn nhóm để thêm khoản chi'
        }
        subtitle="Chạm vào nhóm bạn muốn ghi khoản chi ngay"
        scrollable
        footer={
          <ChiaNeButton
            label="Đóng"
            variant="quiet"
            onPress={() => setPickerMode(null)}
          />
        }
      >
        <View style={styles.modalList}>
          {recentGroups.map((group) => {
            const meta = GROUP_CATEGORY_META[group.category];
            const { Icon } = meta;
            return (
              <ScalePressable
                key={group.id}
                onPress={() => handlePickGroup(group)}
                scaleTo={0.98}
                style={styles.pickerRow}
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
              </ScalePressable>
            );
          })}
        </View>
      </BottomSheetModal>

      <InviteLinkModal
        visible={inviteModalVisible}
        onClose={() => setInviteModalVisible(false)}
        onSubmitCode={(inviteCode) => {
          setInviteModalVisible(false);
          const go = () => navigation.navigate('GuestJoin', { inviteCode });
          if (Platform.OS === 'ios') {
            setTimeout(go, 220);
          } else {
            go();
          }
        }}
      />
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
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 12,
  },
  headerTextCol: {
    flex: 1,
  },
  greetingSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
  },
  greetingName: {
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.ink,
  },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...shadows.card,
  },
  badgeCountPill: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.coral,
    borderWidth: 2,
    borderColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCountText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    lineHeight: 12,
    color: colors.white,
  },
  stateWrap: {
    marginTop: 12,
  },
  content: {
    gap: 16,
  },
  heroCard: {
    backgroundColor: colors.forest,
    borderRadius: radii.heroCard,
    padding: 20,
    minHeight: 192,
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
    ...shadows.hero,
  },
  heroGlowLarge: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(208, 244, 119, 0.12)',
    top: -64,
    right: -40,
  },
  heroGlowSmall: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    bottom: -45,
    left: -25,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  heroEyebrow: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    lineHeight: 15,
    color: colors.lime,
    letterSpacing: 0.5,
  },
  heroStatusPill: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroStatusText: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    lineHeight: 14,
  },
  heroHeading: {
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 30,
    color: colors.white,
    marginTop: 8,
    marginBottom: 16,
  },
  balanceColumns: {
    flexDirection: 'row',
    gap: 10,
  },
  balanceTile: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 4,
  },
  balanceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.onForestLabel,
  },
  balanceHint: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: colors.lime,
  },
  owedAmount: {
    fontFamily: fonts.bold,
    fontSize: 21,
    lineHeight: 28,
    color: colors.lime,
  },
  oweAmount: {
    fontFamily: fonts.bold,
    fontSize: 21,
    lineHeight: 28,
    color: colors.white,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  quickActionItem: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 8,
    ...shadows.card,
  },
  quickIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickEmoji: {
    fontSize: 19,
  },
  quickEmojiLight: {
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 24,
    color: colors.lime,
  },
  quickLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    lineHeight: 15,
    color: colors.ink,
    textAlign: 'center',
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
    ...shadows.card,
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
  quickSettleCard: {
    backgroundColor: colors.peach,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: 'rgba(173, 76, 56, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quickSettleBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickSettleEmoji: {
    fontSize: 18,
  },
  quickSettleCol: {
    flex: 1,
    gap: 2,
  },
  quickSettleEyebrow: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.coral,
    letterSpacing: 0.4,
  },
  quickSettleTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
    ...tabularNums,
  },
  quickSettleAction: {
    backgroundColor: colors.coral,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  quickSettleActionText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.white,
  },
  bankSetupCard: {
    backgroundColor: colors.lavender,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: 'rgba(110, 85, 165, 0.18)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  bankSetupMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bankIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankSetupTextCol: {
    flex: 1,
    gap: 2,
  },
  bankSetupTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.purple,
  },
  bankSetupSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.purple,
  },
  bankDismissBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  bankDismissText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.purple,
    opacity: 0.8,
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    lineHeight: 26,
    color: colors.ink,
  },
  seeAll: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    lineHeight: 17,
    color: colors.forest,
  },
  groupList: {
    gap: 12,
  },
  smartEmptyCard: {
    backgroundColor: colors.white,
    borderRadius: radii.featureCard,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    gap: 12,
    ...shadows.card,
  },
  smartEmptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    lineHeight: 23,
    color: colors.ink,
  },
  smartEmptySub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
    marginTop: -4,
  },
  templateList: {
    gap: 8,
  },
  templatePill: {
    minHeight: 48,
    backgroundColor: colors.paper,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  templateEmoji: {
    fontSize: 18,
  },
  templateText: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
  },
  activitiesSection: {
    gap: 10,
    marginTop: 2,
  },
  activitiesCard: {
    backgroundColor: colors.white,
    borderRadius: radii.featureCard,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 4,
    ...shadows.card,
  },
  actRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  actBadge: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actTextCol: {
    flex: 1,
    gap: 2,
  },
  actTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  actMeta: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.muted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
  },
  footerQuote: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 6,
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
    borderWidth: 1,
    borderColor: colors.line,
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
});
