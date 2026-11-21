import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  formatVnd,
  type GroupBalancesDto,
  type SettlementMethod,
} from '@chiane/shared';
import IconBank from '../../../assets/figma/icon-bank.svg';
import IconCheckDark from '../../../assets/figma/icon-check-dark.svg';
import IconReceipt from '../../../assets/figma/icon-receipt.svg';
import IconShieldPurple from '../../../assets/figma/icon-shield-purple.svg';
import {
  AppHeader,
  ChiaNeButton,
  InfoCard,
  ScreenContainer,
  StateView,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { settlementsApi } from '../../services/settlementsApi';
import { colors, fonts, radii } from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'Payment'>;

export function PaymentScreen({ navigation, route }: Props) {
  const { groupId, toMemberId, amountVnd } = route.params;

  const [balances, setBalances] = useState<GroupBalancesDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [method, setMethod] = useState<SettlementMethod>('BANK_TRANSFER');
  const [submitting, setSubmitting] = useState(false);

  const idempotencyKeyRef = useRef(
    `chiane_cash_${groupId}_${toMemberId}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`
  );

  const loadBalances = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const res = await settlementsApi.getBalances(groupId);
      setBalances(res);
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể tải thông tin thanh toán.'
      );
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      void loadBalances();
    }, [loadBalances])
  );

  const recipient = balances?.memberBalances.find((m) => m.memberId === toMemberId);
  const bankPreview = recipient?.bankPreview ?? null;

  const handleContinue = async () => {
    if (!balances || !recipient) return;

    if (method === 'BANK_TRANSFER') {
      navigation.navigate('BankTransferQr', {
        groupId,
        toMemberId,
        amountVnd,
      });
      return;
    }

    setSubmitting(true);
    setErrorText(null);
    try {
      const { settlement } = await settlementsApi.reportSettlement(groupId, {
        fromMemberId: balances.myMemberId,
        toMemberId,
        amountVnd,
        method: 'CASH',
        memo: 'Thanh toán tiền mặt',
        idempotencyKey: idempotencyKeyRef.current,
      });
      navigation.replace('WaitingConfirmation', { settlementId: settlement.id });
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể báo thanh toán tiền mặt.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      header={<AppHeader title="Thanh toán" onBack={() => navigation.goBack()} />}
      footer={
        balances && recipient ? (
          <ChiaNeButton
            label={
              method === 'BANK_TRANSFER'
                ? 'Tạo QR chuyển khoản'
                : 'Báo đã thanh toán tiền mặt'
            }
            variant="primary"
            loading={submitting}
            onPress={() => void handleContinue()}
          />
        ) : undefined
      }
    >
      {loading && !balances ? (
        <StateView kind="loading" title="Đang chuẩn bị thông tin..." />
      ) : errorText && !balances ? (
        <StateView
          kind="error"
          title="Không tải được thanh toán"
          description={errorText}
          actionLabel="Thử lại"
          onAction={() => void loadBalances()}
        />
      ) : balances && recipient ? (
        <View style={styles.content}>
          {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

          <View style={styles.forestHero}>
            <Text style={styles.heroEyebrow}>
              {`BẠN CHUYỂN CHO ${recipient.displayName.toUpperCase()}`}
            </Text>
            <Text style={styles.heroAmount}>{formatVnd(amountVnd)}</Text>
            <Text style={styles.heroMeta}>
              {`${balances.groupName} · Đã tối ưu số dư`}
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Chọn cách thanh toán</Text>

          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: method === 'BANK_TRANSFER' }}
            onPress={() => setMethod('BANK_TRANSFER')}
            style={[
              styles.methodCard,
              method === 'BANK_TRANSFER' && styles.methodSelected,
            ]}
          >
            <View style={styles.methodIconBox}>
              <IconBank width={24} height={24} />
            </View>
            <View style={styles.methodTextCol}>
              <Text style={styles.methodTitle}>Chuyển khoản ngân hàng</Text>
              <Text style={styles.methodSub}>Quét QR, điền sẵn số tiền</Text>
            </View>
            {method === 'BANK_TRANSFER' ? (
              <IconCheckDark width={21} height={21} />
            ) : null}
          </Pressable>

          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: method === 'CASH' }}
            onPress={() => setMethod('CASH')}
            style={[
              styles.methodCard,
              method === 'CASH' && styles.methodSelected,
            ]}
          >
            <View style={[styles.methodIconBox, styles.cashBadge]}>
              <IconReceipt width={22} height={22} />
            </View>
            <View style={styles.methodTextCol}>
              <Text style={styles.methodTitle}>Tiền mặt</Text>
              <Text style={styles.methodSub}>
                Gặp mặt trực tiếp, báo người nhận xác nhận
              </Text>
            </View>
            {method === 'CASH' ? <IconCheckDark width={21} height={21} /> : null}
          </Pressable>

          <InfoCard tone="white" style={styles.recipientCard}>
            <Text style={styles.recipientEyebrow}>NGƯỜI NHẬN</Text>
            <Text style={styles.recipientHolder}>
              {bankPreview?.hasRealBank
                ? (
                    bankPreview.bankAccountHolder || recipient.displayName
                  ).toUpperCase()
                : recipient.displayName}
            </Text>
            {bankPreview?.hasRealBank ? (
              <Text style={styles.recipientBank}>
                {`${bankPreview.bankName ?? 'Ngân hàng'} · ${bankPreview.maskedAccountNumber ?? ''}`}
              </Text>
            ) : (
              <Text style={styles.recipientMissing}>
                Chưa thêm thông tin ngân hàng — bạn vẫn có thể chuyển ngoài app hoặc chọn tiền mặt.
              </Text>
            )}
          </InfoCard>

          <View style={styles.safetyCard}>
            <IconShieldPurple width={23} height={23} />
            <Text style={styles.safetyText}>
              Kiểm tra tên người nhận trước khi chuyển. ChiaNè không giữ tiền và không tự động trích tiền từ tài khoản của bạn.
            </Text>
          </View>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.coral,
  },
  forestHero: {
    minHeight: 158,
    backgroundColor: colors.forest,
    borderRadius: radii.heroCard,
    padding: 20,
    justifyContent: 'space-between',
    gap: 8,
  },
  heroEyebrow: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: colors.lime,
  },
  heroAmount: {
    fontFamily: fonts.bold,
    fontSize: 38,
    lineHeight: 48,
    color: colors.white,
  },
  heroMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.onForestLabel,
  },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 17,
    color: colors.ink,
    marginTop: 6,
  },
  methodCard: {
    minHeight: 84,
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  methodSelected: {
    borderColor: colors.forest,
    borderWidth: 1.5,
  },
  methodIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashBadge: {
    backgroundColor: colors.lavender,
  },
  methodTextCol: {
    flex: 1,
    gap: 4,
  },
  methodTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  methodSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
  recipientCard: {
    gap: 6,
  },
  recipientEyebrow: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: colors.muted,
  },
  recipientHolder: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
  },
  recipientBank: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
  recipientMissing: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
  },
  safetyCard: {
    backgroundColor: colors.lavender,
    borderRadius: radii.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  safetyText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.purple,
  },
});
