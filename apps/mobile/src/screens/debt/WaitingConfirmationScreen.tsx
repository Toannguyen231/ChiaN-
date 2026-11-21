import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { formatVnd, type SettlementDto } from '@chiane/shared';
import {
  AppHeader,
  ChiaNeButton,
  IconClock,
  ScreenContainer,
  StateView,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { settlementsApi } from '../../services/settlementsApi';
import { colors, fonts, radii } from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'WaitingConfirmation'>;

export function WaitingConfirmationScreen({ navigation, route }: Props) {
  const { settlementId } = route.params;

  const [settlement, setSettlement] = useState<SettlementDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  const loadSettlement = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const res = await settlementsApi.getSettlement(settlementId);
      setSettlement(res.settlement);
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể tải trạng thái thanh toán.'
      );
    } finally {
      setLoading(false);
    }
  }, [settlementId]);

  useFocusEffect(
    useCallback(() => {
      void loadSettlement();
    }, [loadSettlement])
  );

  const goBackToGroup = () => {
    if (settlement) {
      navigation.navigate('GroupDetails', { groupId: settlement.groupId });
    } else {
      navigation.goBack();
    }
  };

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      header={
        <AppHeader
          title={
            settlement ? `Đã báo cho ${settlement.toName}` : 'Chờ xác nhận'
          }
          onBack={() => navigation.goBack()}
        />
      }
      footer={
        <ChiaNeButton
          label="Về nhóm"
          variant="primary"
          onPress={goBackToGroup}
        />
      }
    >
      {loading && !settlement ? (
        <StateView kind="loading" title="Đang tải trạng thái..." />
      ) : errorText && !settlement ? (
        <StateView
          kind="error"
          title="Không tải được giao dịch"
          description={errorText}
          actionLabel="Thử lại"
          onAction={() => void loadSettlement()}
        />
      ) : settlement ? (
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <IconClock width={50} height={50} color={colors.purple} />
          </View>

          <Text style={styles.title}>{`Nhắn ${settlement.toName} rồi nè!`}</Text>
          <Text style={styles.subtitle}>
            {`Bạn đã báo chuyển ${formatVnd(settlement.amountVnd)}.\nChờ ${settlement.toName} xác nhận đã nhận tiền nhé.`}
          </Text>

          <View style={styles.card}>
            <Text style={styles.routeText}>
              {`${settlement.fromName} → ${settlement.toName}`}
            </Text>
            <Text style={styles.amount}>{formatVnd(settlement.amountVnd)}</Text>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>
                {settlement.status === 'CONFIRMED'
                  ? 'Đã xác nhận'
                  : settlement.status === 'REJECTED'
                    ? 'Người nhận báo chưa nhận được'
                    : `Đang chờ ${settlement.toName} xác nhận`}
              </Text>
            </View>
          </View>

          <Text style={styles.caption}>
            {`Số dư chỉ cập nhật khi ${settlement.toName} xác nhận.\nKhông cần chuyển tiền lần nữa.`}
          </Text>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    paddingTop: 24,
    gap: 16,
  },
  iconCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: colors.ink,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: 18,
    gap: 10,
    marginTop: 8,
  },
  routeText: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: colors.ink,
  },
  amount: {
    fontFamily: fonts.bold,
    fontSize: 26,
    color: colors.forest,
  },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.lavender,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusPillText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.purple,
  },
  caption: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 8,
  },
});
