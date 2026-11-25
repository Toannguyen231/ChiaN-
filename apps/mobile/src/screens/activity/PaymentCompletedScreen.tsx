import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { formatVnd, type SettlementDto } from '@chiane/shared';
import IconCheckDark from '../../../assets/figma/icon-check-dark.svg';
import {
  AppHeader,
  ChiaNeButton,
  FadeSlideIn,
  ScreenContainer,
  StateView,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { settlementsApi } from '../../services/settlementsApi';
import { colors, fonts, radii, shadows, tabularNums } from '../../theme/tokens';

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

  const iconScale = useRef(new Animated.Value(0.6)).current;
  const ringScale = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    if (!settlement) return;
    Animated.spring(iconScale, {
      toValue: 1,
      friction: 5,
      tension: 120,
      useNativeDriver: true,
    }).start();

    const loop = Animated.loop(
      Animated.parallel([
        Animated.timing(ringScale, {
          toValue: 1.38,
          duration: 1400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(ringOpacity, {
          toValue: 0,
          duration: 1400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [iconScale, ringOpacity, ringScale, settlement]);

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
          <View style={styles.celebrateWrap}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pulseRing,
                {
                  opacity: ringOpacity,
                  transform: [{ scale: ringScale }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.iconCircle,
                { transform: [{ scale: iconScale }] },
              ]}
            >
              <IconCheckDark width={52} height={52} />
            </Animated.View>
          </View>

          <FadeSlideIn index={0} style={styles.centeredText}>
            <Text style={styles.title}>Gọn tiền, vui bạn! 🎉</Text>
            <Text style={styles.subtitle}>
              {`${settlement.toName} đã xác nhận nhận ${formatVnd(settlement.amountVnd)}.\nKhoản này đã được chốt rõ ràng.`}
            </Text>
          </FadeSlideIn>

          <FadeSlideIn index={1} style={styles.fullWidth}>
            <View style={styles.receiptCard}>
              <Text style={styles.route}>
                {`${settlement.fromName} → ${settlement.toName}`}
              </Text>
              <Text style={[styles.amount, tabularNums]}>
                {formatVnd(settlement.amountVnd)}
              </Text>
              <View style={styles.limePill}>
                <Text style={styles.limePillText}>
                  {`Đã xác nhận · ${formatTimeHhMm(settlement.confirmedAt)}`}
                </Text>
              </View>
            </View>
          </FadeSlideIn>

          <FadeSlideIn index={2} style={styles.centeredText}>
            <Text style={[styles.balanceLine, tabularNums]}>
              {`Số dư của bạn trong nhóm: ${formatVnd(myBalance)}`}
            </Text>
            <Text style={styles.footerQuote}>
              Thêm chuyến đi, bớt chuyện tính tiền.
            </Text>
          </FadeSlideIn>
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
  celebrateWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  pulseRing: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.lime,
  },
  iconCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.elevated,
  },
  centeredText: {
    alignItems: 'center',
    gap: 8,
  },
  fullWidth: {
    width: '100%',
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
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    gap: 10,
    marginTop: 4,
    ...shadows.card,
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
    marginTop: 6,
  },
  footerQuote: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
  },
});
