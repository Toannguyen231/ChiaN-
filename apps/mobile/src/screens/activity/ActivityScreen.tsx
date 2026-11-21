import React, { useCallback, useMemo, useState } from 'react';
import {
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
import type { ActivityItemDto } from '@chiane/shared';
import IconBell from '../../../assets/figma/icon-bell.svg';
import IconCheckDark from '../../../assets/figma/icon-check-dark.svg';
import IconLink from '../../../assets/figma/icon-link.svg';
import IconPlus from '../../../assets/figma/icon-plus.svg';
import IconReceipt from '../../../assets/figma/icon-receipt.svg';
import {
  IconClock,
  ScreenContainer,
  StateView,
} from '../../components';
import type { AppStackParamList, MainTabParamList } from '../../navigation/types';
import { activityApi, type ActivityFilter } from '../../services/activityApi';
import { ApiClientError } from '../../services/apiClient';
import { settlementsApi } from '../../services/settlementsApi';
import { useGroupsStore } from '../../store/groupsStore';
import { colors, fonts, radii, sizes } from '../../theme/tokens';

type ActivityNav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'ActivityTab'>,
  NativeStackNavigationProp<AppStackParamList>
>;

const FILTERS: Array<{ key: ActivityFilter; label: string }> = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'EXPENSE', label: 'Khoản chi' },
  { key: 'PAYMENT', label: 'Thanh toán' },
];

function formatDateHeader(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const yest = new Date(now.getTime() - 86400000);
  const isYesterday =
    d.getDate() === yest.getDate() &&
    d.getMonth() === yest.getMonth() &&
    d.getFullYear() === yest.getFullYear();

  if (isToday) {
    return `HÔM NAY · ${d.getDate()} THÁNG ${d.getMonth() + 1}`;
  }
  if (isYesterday) {
    return `HÔM QUA · ${d.getDate()} THÁNG ${d.getMonth() + 1}`;
  }
  return `${d.getDate().toString().padStart(2, '0')} THÁNG ${d.getMonth() + 1}, ${d.getFullYear()}`;
}

function formatClockTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return 'Vừa xong';
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

export function ActivityScreen() {
  const navigation = useNavigation<ActivityNav>();
  const activeGroups = useGroupsStore((s) => s.activeGroups);

  const [filter, setFilter] = useState<ActivityFilter>('ALL');
  const [activities, setActivities] = useState<ActivityItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const loadFeed = useCallback(
    async (nextFilter: ActivityFilter, isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setErrorText(null);
      try {
        const res = await activityApi.listActivity({ filter: nextFilter });
        setActivities(res.activities);
      } catch (err) {
        setErrorText(
          err instanceof ApiClientError
            ? err.message
            : 'Không thể tải dòng hoạt động.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      void loadFeed(filter, false);
    }, [filter, loadFeed])
  );

  const groupedSections = useMemo(() => {
    const map = new Map<string, ActivityItemDto[]>();
    for (const item of activities) {
      const header = formatDateHeader(item.createdAt);
      const list = map.get(header) ?? [];
      list.push(item);
      map.set(header, list);
    }
    return Array.from(map.entries()).map(([header, items]) => ({ header, items }));
  }, [activities]);

  const handleQuickPlus = () => {
    if (activeGroups.length === 1) {
      navigation.navigate('AddExpense', { groupId: activeGroups[0]!.id });
    } else if (activeGroups.length > 1) {
      navigation.navigate('DashboardTab');
    } else {
      navigation.navigate('CreateGroup');
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
          // fallback to group balances
        }
      }
      navigation.navigate('GroupBalances', { groupId: item.groupId });
      return;
    }

    navigation.navigate('GroupDetails', { groupId: item.groupId });
  };

  const renderBadge = (item: ActivityItemDto) => {
    switch (item.type) {
      case 'SETTLEMENT_REPORTED':
      case 'SETTLEMENT_REJECTED':
        return (
          <View style={[styles.badge, { backgroundColor: colors.peach }]}>
            <IconClock width={20} height={20} color={colors.coral} />
          </View>
        );
      case 'SETTLEMENT_CONFIRMED':
        return (
          <View style={[styles.badge, { backgroundColor: colors.lime }]}>
            <IconCheckDark width={20} height={20} />
          </View>
        );
      case 'REMINDER_SENT':
        return (
          <View style={[styles.badge, { backgroundColor: colors.peach }]}>
            <IconBell width={20} height={20} />
          </View>
        );
      case 'GROUP_CREATED':
      case 'MEMBER_JOINED':
      case 'MEMBER_LEFT':
      case 'MEMBER_REMOVED':
        return (
          <View style={[styles.badge, { backgroundColor: colors.lime }]}>
            <IconLink width={20} height={20} />
          </View>
        );
      default:
        return (
          <View style={[styles.badge, { backgroundColor: colors.lavender }]}>
            <IconReceipt width={20} height={20} />
          </View>
        );
    }
  };

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      edges={['top']}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadFeed(filter, true)}
          tintColor={colors.forest}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Hoạt động</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Thêm khoản chi nhanh"
          hitSlop={8}
          onPress={handleQuickPlus}
          style={({ pressed }) => [styles.plusBtn, pressed && styles.pressed]}
        >
          <IconPlus width={24} height={24} />
        </Pressable>
      </View>

      <View style={styles.segmentWrap}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(f.key)}
              style={[styles.segmentItem, active && styles.segmentItemActive]}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  active && styles.segmentLabelActive,
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.stateWrap}>
          <StateView kind="loading" title="Đang tải hoạt động..." />
        </View>
      ) : errorText ? (
        <View style={styles.stateWrap}>
          <StateView
            kind="error"
            title="Chưa tải được hoạt động"
            description={errorText}
            actionLabel="Thử lại"
            onAction={() => void loadFeed(filter, false)}
          />
        </View>
      ) : activities.length === 0 ? (
        <View style={styles.stateWrap}>
          <StateView
            kind="empty"
            title="Chưa có hoạt động mới"
            description="Mỗi khi nhóm có khoản chi mới, lời nhắc nhẹ hay xác nhận thanh toán, lịch sử sẽ hiện rõ tại đây."
          />
        </View>
      ) : (
        <View style={styles.feed}>
          {groupedSections.map((section) => (
            <View key={section.header} style={styles.sectionBlock}>
              <Text style={styles.dateHeader}>{section.header}</Text>
              <View style={styles.sectionList}>
                {section.items.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => void handleTapActivity(item)}
                    style={({ pressed }) => [
                      styles.card,
                      pressed && styles.pressed,
                    ]}
                  >
                    {renderBadge(item)}
                    <View style={styles.cardTextCol}>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={styles.cardSub} numberOfLines={2}>
                        {item.subtitle}
                      </Text>
                      <Text style={styles.cardTime}>
                        {`${formatClockTime(item.createdAt)} · ${item.groupName}`}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          <Text style={styles.footerCaption}>
            Mọi thay đổi đều có dấu vết rõ ràng.
          </Text>
        </View>
      )}
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
  title: {
    fontFamily: fonts.bold,
    fontSize: 24,
    lineHeight: 35,
    color: colors.ink,
  },
  plusBtn: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  segmentWrap: {
    height: 44,
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 4,
    flexDirection: 'row',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.line,
  },
  segmentItem: {
    flex: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemActive: {
    backgroundColor: colors.lime,
  },
  segmentLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
  },
  segmentLabelActive: {
    fontFamily: fonts.semiBold,
    color: colors.forest,
  },
  stateWrap: {
    marginTop: 8,
  },
  feed: {
    gap: 18,
  },
  sectionBlock: {
    gap: 10,
  },
  dateHeader: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: colors.muted,
  },
  sectionList: {
    gap: 10,
  },
  card: {
    minHeight: 96,
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  badge: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextCol: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
  cardSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
  },
  cardTime: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.muted,
    marginTop: 4,
  },
  footerCaption: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
  },
});
