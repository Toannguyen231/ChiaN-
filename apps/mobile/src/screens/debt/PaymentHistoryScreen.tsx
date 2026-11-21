import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  formatVnd,
  type SettlementDto,
  type SettlementStatus,
} from '@chiane/shared';
import {
  AppHeader,
  ChiaNeChip,
  ScreenContainer,
  StateView,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { settlementsApi } from '../../services/settlementsApi';
import { colors, fonts, radii } from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'PaymentHistory'>;

type FilterOption = 'ALL' | SettlementStatus;

const FILTERS: Array<{ key: FilterOption; label: string }> = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'REPORTED', label: 'Chờ xác nhận' },
  { key: 'CONFIRMED', label: 'Đã xác nhận' },
  { key: 'REJECTED', label: 'Từ chối' },
];

export function PaymentHistoryScreen({ navigation, route }: Props) {
  const { groupId } = route.params;

  const [filter, setFilter] = useState<FilterOption>('ALL');
  const [items, setItems] = useState<SettlementDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const loadHistory = useCallback(
    async (statusFilter: FilterOption, isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setErrorText(null);
      try {
        const res = await settlementsApi.listSettlements(
          groupId,
          statusFilter === 'ALL' ? undefined : statusFilter
        );
        setItems(res.settlements);
      } catch (err) {
        setErrorText(
          err instanceof ApiClientError
            ? err.message
            : 'Không thể tải lịch sử thanh toán.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [groupId]
  );

  useFocusEffect(
    useCallback(() => {
      void loadHistory(filter, false);
    }, [filter, loadHistory])
  );

  const handleTapItem = (stl: SettlementDto) => {
    if (stl.canConfirm) {
      navigation.navigate('ConfirmPaymentReceived', { settlementId: stl.id });
    } else if (stl.status === 'CONFIRMED') {
      navigation.navigate('PaymentCompleted', { settlementId: stl.id });
    } else {
      navigation.navigate('WaitingConfirmation', { settlementId: stl.id });
    }
  };

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadHistory(filter, true)}
          tintColor={colors.forest}
        />
      }
      header={
        <AppHeader title="Lịch sử thanh toán" onBack={() => navigation.goBack()} />
      }
    >
      <View style={styles.filtersRow}>
        {FILTERS.map((f) => (
          <ChiaNeChip
            key={f.key}
            label={f.label}
            active={filter === f.key}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </View>

      {loading ? (
        <StateView kind="loading" title="Đang tải lịch sử thanh toán..." />
      ) : errorText ? (
        <StateView
          kind="error"
          title="Không tải được lịch sử"
          description={errorText}
          actionLabel="Thử lại"
          onAction={() => void loadHistory(filter, false)}
        />
      ) : items.length === 0 ? (
        <StateView
          kind="empty"
          title="Chưa có giao dịch nào"
          description="Khi thành viên báo chuyển khoản hoặc thanh toán tiền mặt, bản ghi sẽ hiển thị tại đây."
        />
      ) : (
        <View style={styles.list}>
          {items.map((stl) => {
            const badgeBg =
              stl.status === 'CONFIRMED'
                ? colors.lime
                : stl.status === 'REJECTED'
                  ? colors.peach
                  : colors.lavender;
            const badgeColor =
              stl.status === 'CONFIRMED'
                ? colors.forest
                : stl.status === 'REJECTED'
                  ? colors.coral
                  : colors.purple;
            const statusText =
              stl.status === 'CONFIRMED'
                ? 'Đã xác nhận'
                : stl.status === 'REJECTED'
                  ? 'Từ chối'
                  : 'Chờ xác nhận';

            return (
              <Pressable
                key={stl.id}
                onPress={() => handleTapItem(stl)}
                style={({ pressed }) => [styles.rowCard, pressed && styles.pressed]}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.route}>{`${stl.fromName} → ${stl.toName}`}</Text>
                  <Text style={styles.amount}>{formatVnd(stl.amountVnd)}</Text>
                </View>
                <View style={styles.rowBottom}>
                  <Text style={styles.methodText}>
                    {stl.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'}
                    {stl.rejectReason ? ` · ${stl.rejectReason}` : ''}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: badgeBg }]}>
                    <Text style={[styles.badgeText, { color: badgeColor }]}>
                      {statusText}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  list: {
    gap: 10,
  },
  rowCard: {
    backgroundColor: colors.white,
    borderRadius: radii.row,
    padding: 16,
    gap: 8,
  },
  pressed: {
    opacity: 0.85,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  route: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
    flex: 1,
  },
  amount: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.forest,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  methodText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    flex: 1,
  },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
  },
});
