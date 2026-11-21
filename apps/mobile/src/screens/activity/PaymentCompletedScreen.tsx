import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { formatVnd, type SettlementDto } from '@chiane/shared';
import IconCheckDark from '../../../assets/figma/icon-check-dark.svg';
import {
  AppHeader,
  ChiaNeButton,
  ScreenContainer,
  StateView,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { settlementsApi } from '../../services/settlementsApi';
import { colors, fonts, radii } from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'PaymentCompleted'>;

function formatTimeHhMm(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

export function PaymentCompletedScreen({ navigation, route }: Props) {
  const { settlementId } = route.params;

  const [settlement, setSettlement] = useState<SettlementDto | null>(null);
  const [myBalance, setMyBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const res = await settlementsApi.getSettlement(settlementId);
      setSettlement(res.settlement);
      setMyBalance(res.myNewGroupBalanceVnd);
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể tải biên nhận thanh toán.'
      );
    } finally {
      setLoading(false);
    }
  }, [settlementId]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
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
        <AppHeader title="Đã thanh toán" onBack={() => navigation.goBack()} />
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
        <StateView kind="loading" title="Đang tải biên nhận..." />
      ) : errorText && !settlement ? (
        <StateView
          kind="error"
          title="Chưa tải được giao dịch"
          description={errorText}
          actionLabel="Thử lại"
          onAction={() => void loadData()}
        />
      ) : settlement ? (
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <IconCheckDark width={52} height={52} />
          </View>

          <Text style={styles.title}>Gọn tiền, vui bạn!</Text>
          <Text style={styles.subtitle}>
            {`${settlement.toName} đã xác nhận nhận ${formatVnd(settlement.amountVnd)}.\nKhoản này đã được chốt rõ ràng.`}
          </Text>

          <View style={styles.receiptCard}>
            <Text style={styles.route}>
              {`${settlement.fromName} → ${settlement.toName}`}
            </Text>
            <Text style={styles.amount}>{formatVnd(settlement.amountVnd)}</Text>
            <View style={styles.limePill}>
              <Text style={styles.limePillText}>
                {`Đã xác nhận · ${formatTimeHhMm(settlement.confirmedAt)}`}
              </Text>
            </View>
          </View>

          <Text style={styles.balanceLine}>
            {`Số dư của bạn trong nhóm: ${formatVnd(myBalance)}`}
          </Text>
          <Text style={styles.footerQuote}>
            Thêm chuyến đi, bớt chuyện tính tiền.
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
    gap: 14,
  },
  iconCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 28,
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
  receiptCard: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: 18,
    gap: 10,
    marginTop: 8,
  },
  route: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: colors.ink,
  },
  amount: {
    fontFamily: fonts.bold,
    fontSize: 26,
    color: colors.forest,
  },
  limePill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.lime,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  limePillText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.forest,
  },
  balanceLine: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
    marginTop: 10,
  },
  footerQuote: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
  },
});
