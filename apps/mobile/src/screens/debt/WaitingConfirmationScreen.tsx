import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { formatVnd, type SettlementDto } from '@chiane/shared';
import {
  AppHeader,
  ChiaNeButton,
  FadeSlideIn,
  IconClock,
  ScreenContainer,
  StateView,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { settlementsApi } from '../../services/settlementsApi';
import { colors, fonts, radii, shadows, tabularNums } from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'WaitingConfirmation'>;

export function WaitingConfirmationScreen({ navigation, route }: Props) {
  const { settlementId } = route.params;

  const [settlement, setSettlement] = useState<SettlementDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  const pulseScale = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    if (!settlement) return;
    const loop = Animated.loop(
      Animated.parallel([
        Animated.timing(pulseScale, {
          toValue: 1.32,
          duration: 1600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(ringOpacity, {
          toValue: 0,
          duration: 1600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseScale, ringOpacity, settlement]);

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
          <View style={styles.pulseWrap}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pulseRing,
                {
                  opacity: ringOpacity,
                  transform: [{ scale: pulseScale }],
                },
              ]}
            />
            <View style={styles.iconCircle}>
              <IconClock width={50} height={50} color={colors.purple} />
            </View>
          </View>

          <FadeSlideIn index={0} style={styles.centeredText}>
            <Text style={styles.title}>{`Nhắn ${settlement.toName} rồi nè!`}</Text>
            <Text style={styles.subtitle}>
              {`Bạn đã báo chuyển ${formatVnd(settlement.amountVnd)}.\nChờ ${settlement.toName} xác nhận đã nhận tiền nhé.`}
            </Text>
          </FadeSlideIn>

          <FadeSlideIn index={1} style={styles.fullWidth}>
            <View style={styles.card}>
              <Text style={styles.routeText}>
                {`${settlement.fromName} → ${settlement.toName}`}
              </Text>
              <Text style={[styles.amount, tabularNums]}>
                {formatVnd(settlement.amountVnd)}
              </Text>
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
          </FadeSlideIn>

          <FadeSlideIn index={2}>
            <Text style={styles.caption}>
              {`Số dư chỉ cập nhật khi ${settlement.toName} xác nhận.\nKhông cần chuyển tiền lần nữa.`}
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
    gap: 16,
  },
  pulseWrap: {
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
    backgroundColor: colors.lavender,
  },
  iconCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
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
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    gap: 10,
    marginTop: 4,
    ...shadows.card,
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
