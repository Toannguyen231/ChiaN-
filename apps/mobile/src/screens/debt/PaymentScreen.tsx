import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import {
  buildVietQrPayload,
  formatVnd,
  type BankAccountPreviewDto,
  type GroupBalancesDto,
  type SettlementMethod,
} from '@chiane/shared';
import IconCopy from '../../../assets/figma/icon-copy.svg';
import IconReceipt from '../../../assets/figma/icon-receipt.svg';
import IconShieldPurple from '../../../assets/figma/icon-shield-purple.svg';
import {
  AnimatedSegmentedControl,
  AppHeader,
  ChiaNeButton,
  InfoCard,
  ScalePressable,
  ScreenContainer,
  showToast,
  StateView,
  VietQrMatrix,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { settlementsApi } from '../../services/settlementsApi';
import { colors, fonts, radii, shadows, tabularNums } from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'Payment'>;

function buildCleanMemo(fromName: string, groupName: string): string {
  const ascii = `${fromName} tra tien ${groupName}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
  return ascii || 'ChiaNe thanh toan';
}

export function PaymentScreen({ navigation, route }: Props) {
  const { groupId, toMemberId, amountVnd } = route.params;

  const [balances, setBalances] = useState<GroupBalancesDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [method, setMethod] = useState<SettlementMethod>('BANK_TRANSFER');
  const [submitting, setSubmitting] = useState(false);

  const idempotencyKeyRef = useRef(
    `chiane_stl_${groupId}_${toMemberId}_${Date.now()}_${Math.random()
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

  const myMember = balances?.memberBalances.find((m) => m.isMe);
  const recipient = balances?.memberBalances.find((m) => m.memberId === toMemberId);
  const bankPreview: BankAccountPreviewDto | null = recipient?.bankPreview ?? null;

  const memo = useMemo(
    () =>
      buildCleanMemo(
        myMember?.displayName ?? 'Ban',
        balances?.groupName ?? 'nhom'
      ),
    [balances?.groupName, myMember?.displayName]
  );

  const vietQrPayload = useMemo(() => {
    if (!bankPreview?.hasRealBank) return null;
    return buildVietQrPayload({
      bankBin: bankPreview.bankBin,
      accountNumber: bankPreview.bankAccountNumber,
      amountVnd,
      memo,
    });
  }, [amountVnd, bankPreview, memo]);

  const handleCopyMemo = async () => {
    await Clipboard.setStringAsync(memo);
    showToast('Đã sao chép nội dung chuyển khoản');
  };

  const handleCopyAccount = async () => {
    if (!bankPreview?.bankAccountNumber) return;
    await Clipboard.setStringAsync(bankPreview.bankAccountNumber);
    showToast('Đã sao chép số tài khoản');
  };

  const handleShareInfo = async () => {
    if (!recipient) return;
    const bankLine = bankPreview?.hasRealBank
      ? `${bankPreview.bankName} · STK ${bankPreview.bankAccountNumber} (${bankPreview.bankAccountHolder || recipient.displayName})`
      : `${recipient.displayName} (chưa cập nhật STK)`;
    await Share.share({
      message: `Thanh toán ChiaNè ${formatVnd(amountVnd)} cho ${bankLine}. Nội dung: ${memo}`,
    });
  };

  const handleConfirmPaid = async () => {
    if (!balances || !recipient) return;

    setSubmitting(true);
    setErrorText(null);
    try {
      const { settlement } = await settlementsApi.reportSettlement(groupId, {
        fromMemberId: balances.myMemberId,
        toMemberId,
        amountVnd,
        method,
        memo: method === 'BANK_TRANSFER' ? memo : 'Thanh toán tiền mặt',
        autoConfirm: recipient.isPlaceholder,
        idempotencyKey: idempotencyKeyRef.current,
      });
      showToast(
        method === 'BANK_TRANSFER'
          ? 'Đã báo chuyển khoản thành công!'
          : 'Đã báo thanh toán tiền mặt!'
      );
      navigation.replace(settlement.status === 'CONFIRMED' ? 'PaymentCompleted' : 'WaitingConfirmation', { settlementId: settlement.id });
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể báo đã thanh toán. Vui lòng thử lại.'
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
                ? 'Tôi đã chuyển khoản'
                : 'Báo đã thanh toán tiền mặt'
            }
            variant="primary"
            loading={submitting}
            onPress={() => void handleConfirmPaid()}
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
            <Text style={[styles.heroAmount, tabularNums]}>
              {formatVnd(amountVnd)}
            </Text>
            <Text style={styles.heroMeta}>
              {`${balances.groupName} · Đã tối ưu số dư`}
            </Text>
          </View>

          <AnimatedSegmentedControl<SettlementMethod>
            options={[
              { key: 'BANK_TRANSFER', label: 'Chuyển khoản VietQR' },
              { key: 'CASH', label: 'Tiền mặt' },
            ]}
            value={method}
            onChange={setMethod}
          />

          {method === 'BANK_TRANSFER' ? (
            <>
              <View style={styles.qrCard}>
                <VietQrMatrix payload={vietQrPayload} size={196} />
                <Text style={styles.holderName}>
                  {(bankPreview?.bankAccountHolder || recipient.displayName).toUpperCase()}
                </Text>
                <Text style={styles.bankMeta}>
                  {bankPreview?.hasRealBank
                    ? `${bankPreview.bankName ?? 'Ngân hàng'} · ${bankPreview.bankAccountNumber ?? ''}`
                    : 'Người nhận chưa cập nhật tài khoản ngân hàng'}
                </Text>
                <Text
                  style={[
                    styles.qrNotice,
                    !vietQrPayload && styles.qrNoticeWarning,
                  ]}
                >
                  {vietQrPayload
                    ? 'QR VIETQR CHUẨN NAPAS 247 · ĐIỀN SẴN SỐ TIỀN'
                    : 'QR MINH HỌA · KHÔNG CHUYỂN TIỀN'}
                </Text>
              </View>

              <ScalePressable
                accessibilityRole="button"
                onPress={() => void handleCopyMemo()}
                scaleTo={0.98}
                style={styles.memoBox}
              >
                <Text style={styles.memoText} numberOfLines={1}>
                  {`Nội dung: ${memo}`}
                </Text>
                <IconCopy width={20} height={20} />
              </ScalePressable>

              <View style={styles.secondaryRow}>
                {bankPreview?.bankAccountNumber ? (
                  <Pressable onPress={() => void handleCopyAccount()} hitSlop={8}>
                    <Text style={styles.secondaryAction}>📋 Sao chép STK</Text>
                  </Pressable>
                ) : (
                  <View />
                )}
                <Pressable onPress={() => void handleShareInfo()} hitSlop={8}>
                  <Text style={styles.secondaryAction}>Chia sẻ thông tin</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <InfoCard tone="white" style={styles.cashCard}>
              <View style={styles.cashTopRow}>
                <View style={styles.cashBadge}>
                  <IconReceipt width={22} height={22} />
                </View>
                <View style={styles.cashTextCol}>
                  <Text style={styles.cashTitle}>Thanh toán trực tiếp bằng tiền mặt</Text>
                  <Text style={styles.cashSub}>
                    {`Gửi ${formatVnd(amountVnd)} cho ${recipient.displayName}, sau đó bấm nút bên dưới để ghi nhận.`}
                  </Text>
                </View>
              </View>
            </InfoCard>
          )}

          <View style={styles.safetyCard}>
            <IconShieldPurple width={22} height={22} />
            <Text style={styles.safetyText}>
              {recipient.isPlaceholder ? 'Thành viên này chưa dùng app — khoản thanh toán sẽ được ghi nhận hoàn tất ngay.' : method === 'BANK_TRANSFER'
                ? 'Kiểm tra kỹ tên người nhận trước khi chuyển. Chỉ bấm "Tôi đã chuyển khoản" sau khi đã thanh toán xong.'
                : 'Số dư trong nhóm sẽ được gạch nợ ngay sau khi người nhận xác nhận đã nhận tiền.'}
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
    minHeight: 144,
    backgroundColor: colors.forest,
    borderRadius: radii.heroCard,
    padding: 20,
    justifyContent: 'space-between',
    gap: 6,
    ...shadows.hero,
  },
  heroEyebrow: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: colors.lime,
  },
  heroAmount: {
    fontFamily: fonts.bold,
    fontSize: 36,
    lineHeight: 46,
    color: colors.white,
  },
  heroMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.onForestLabel,
  },
  qrCard: {
    backgroundColor: colors.white,
    borderRadius: radii.featureCard,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 20,
    alignItems: 'center',
    gap: 6,
    ...shadows.card,
  },
  holderName: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
    marginTop: 8,
    textAlign: 'center',
  },
  bankMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
  qrNotice: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: colors.forest,
    marginTop: 6,
    textAlign: 'center',
  },
  qrNoticeWarning: {
    color: colors.coral,
  },
  memoBox: {
    minHeight: 54,
    backgroundColor: colors.lavender,
    borderRadius: radii.input,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  memoText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.purple,
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  secondaryAction: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.forest,
  },
  cashCard: {
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.card,
  },
  cashTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  cashBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashTextCol: {
    flex: 1,
    gap: 4,
  },
  cashTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  cashSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
  },
  safetyCard: {
    backgroundColor: colors.lavender,
    borderRadius: radii.card,
    padding: 15,
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
