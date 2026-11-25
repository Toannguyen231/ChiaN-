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
import type { ActivityItemDto, GroupSummaryDto } from '@chiane/shared';
import IconBell from '../../../assets/figma/icon-bell.svg';
import IconCheckDark from '../../../assets/figma/icon-check-dark.svg';
import IconChevron from '../../../assets/figma/icon-chevron.svg';
import IconLink from '../../../assets/figma/icon-link.svg';
import IconPlus from '../../../assets/figma/icon-plus.svg';
import IconReceipt from '../../../assets/figma/icon-receipt.svg';
import {
  AnimatedSegmentedControl,
  BottomSheetModal,
  CardListSkeleton,
  ChiaNeButton,
  FadeSlideIn,
  GROUP_CATEGORY_META,
  IconClock,
  ScalePressable,
  ScreenContainer,
  StateView,
} from '../../components';
import type { AppStackParamList, MainTabParamList } from '../../navigation/types';
import { activityApi, type ActivityFilter } from '../../services/activityApi';
import { ApiClientError } from '../../services/apiClient';
import { settlementsApi } from '../../services/settlementsApi';
import { useGroupsStore } from '../../store/groupsStore';
import { colors, fonts, radii, shadows, sizes } from '../../theme/tokens';

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
  const [pickerVisible, setPickerVisible] = useState(false);

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
      setPickerVisible(true);
    } else {
      navigation.navigate('CreateGroup');
    }
  };

  const handlePickGroup = (group: GroupSummaryDto) => {
    setPickerVisible(false);
    navigation.navigate('AddExpense', { groupId: group.id });
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

      <AnimatedSegmentedControl<ActivityFilter>
        options={FILTERS}
        value={filter}
        onChange={setFilter}
        style={styles.segmentWrap}
      />

      {loading ? (
        <View style={styles.stateWrap}>
          <CardListSkeleton count={4} cardHeight={86} />
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
          {groupedSections.map((section, sectionIdx) => (
            <View key={section.header} style={styles.sectionBlock}>
              <Text style={styles.dateHeader}>{section.header}</Text>
              <View style={styles.sectionList}>
                {section.items.map((item, itemIdx) => (
                  <FadeSlideIn
                    key={item.id}
                    index={sectionIdx * 2 + itemIdx}
                  >
                    <ScalePressable
                      onPress={() => void handleTapActivity(item)}
                      scaleTo={0.98}
                      style={styles.card}
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
                    </ScalePressable>
                  </FadeSlideIn>
                ))}
              </View>
            </View>
          ))}
          <Text style={styles.footerCaption}>
            Mọi thay đổi đều có dấu vết rõ ràng.
          </Text>
        </View>
      )}

      <BottomSheetModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        title="Chọn nhóm để thêm khoản chi"
        subtitle="Chạm vào nhóm bạn muốn ghi khoản chi ngay"
        scrollable
        footer={
          <ChiaNeButton
            label="Đóng"
            variant="quiet"
            onPress={() => setPickerVisible(false)}
          />
        }
      >
        <View style={styles.pickerList}>
          {activeGroups.map((group) => {
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
    marginBottom: 18,
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
    minHeight: 92,
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    ...shadows.card,
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
  pickerList: {
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
