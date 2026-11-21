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
} from '@chiane/shared';
import IconCopy from '../../../assets/figma/icon-copy.svg';
import {
  AppHeader,
  ChiaNeButton,
  ScreenContainer,
  StateView,
  VietQrMatrix,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { settlementsApi } from '../../services/settlementsApi';
import { colors, fonts, radii } from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'BankTransferQr'>;

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

export function BankTransferQrScreen({ navigation, route }: Props) {
  const { groupId, toMemberId, amountVnd } = route.params;

  const [balances, setBalances] = useState<GroupBalancesDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copiedBanner, setCopiedBanner] = useState<string | null>(null);

  const idempotencyKeyRef = useRef(
    `chiane_bank_${groupId}_${toMemberId}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`
  );

  const loadInfo = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const res = await settlementsApi.getBalances(groupId);
      setBalances(res);
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể tải thông tin chuyển khoản.'
      );
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      void loadInfo();
    }, [loadInfo])
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

  const showCopied = (label: string) => {
    setCopiedBanner(label);
    setTimeout(() => setCopiedBanner(null), 2200);
  };

  const handleCopyMemo = async () => {
    await Clipboard.setStringAsync(memo);
    showCopied('Đã sao chép nội dung chuyển khoản');
  };

  const handleCopyAccount = async () => {
    if (!bankPreview?.bankAccountNumber) return;
    await Clipboard.setStringAsync(bankPreview.bankAccountNumber);
    showCopied('Đã sao chép số tài khoản');
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

  const handleReportedTransfer = async () => {
    if (!balances || !recipient) return;
    setSubmitting(true);
    setErrorText(null);
    try {
      const { settlement } = await settlementsApi.reportSettlement(groupId, {
        fromMemberId: balances.myMemberId,
        toMemberId,
        amountVnd,
        method: 'BANK_TRANSFER',
        memo,
        idempotencyKey: idempotencyKeyRef.current,
      });
      navigation.replace('WaitingConfirmation', { settlementId: settlement.id });
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể báo đã chuyển khoản.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      header={<AppHeader title="Chuyển khoản QR" onBack={() => navigation.goBack()} />}
      footer={
        balances && recipient ? (
          <ChiaNeButton
            label="Tôi đã chuyển khoản"
            variant="primary"
            loading={submitting}
            onPress={() => void handleReportedTransfer()}
          />
        ) : undefined
      }
    >
      {loading && !balances ? (
        <StateView kind="loading" title="Đang chuẩn bị mã chuyển khoản..." />
      ) : errorText && !balances ? (
        <StateView
          kind="error"
          title="Không tải được thông tin QR"
          description={errorText}
          actionLabel="Thử lại"
          onAction={() => void loadInfo()}
        />
      ) : balances && recipient ? (
        <View style={styles.content}>
          <View style={styles.centerTop}>
            <Text style={styles.toLabel}>Chuyển cho {recipient.displayName}</Text>
            <Text style={styles.amountText}>{formatVnd(amountVnd)}</Text>
          </View>

          <View style={styles.qrCard}>
            <VietQrMatrix payload={vietQrPayload} size={204} />
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
                ? 'QR VIETQR CHUẨN NAPAS 247'
                : 'QR MINH HỌA · KHÔNG CHUYỂN TIỀN'}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => void handleCopyMemo()}
            style={({ pressed }) => [styles.memoBox, pressed && styles.pressed]}
          >
            <Text style={styles.memoText} numberOfLines={1}>
              {`Nội dung: ${memo}`}
            </Text>
            <IconCopy width={20} height={20} />
          </Pressable>

          <View style={styles.secondaryRow}>
            {bankPreview?.bankAccountNumber ? (
              <Pressable onPress={() => void handleCopyAccount()} hitSlop={8}>
                <Text style={styles.secondaryAction}>Sao chép STK</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable onPress={() => void handleShareInfo()} hitSlop={8}>
              <Text style={styles.secondaryAction}>Chia sẻ thông tin</Text>
            </Pressable>
          </View>

          {copiedBanner ? (
            <Text style={styles.copiedText}>{copiedBanner}</Text>
          ) : null}

          {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

          <Text style={styles.caption}>
            Chỉ xác nhận sau khi bạn đã chuyển tiền.
          </Text>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
  },
  centerTop: {
    alignItems: 'center',
    gap: 4,
  },
  toLabel: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
  },
  amountText: {
    fontFamily: fonts.bold,
    fontSize: 34,
    lineHeight: 44,
    color: colors.forest,
  },
  qrCard: {
    backgroundColor: colors.white,
    borderRadius: radii.featureCard,
    padding: 22,
    alignItems: 'center',
    gap: 8,
  },
  holderName: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
    marginTop: 10,
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
    marginTop: 8,
    textAlign: 'center',
  },
  qrNoticeWarning: {
    color: colors.coral,
  },
  memoBox: {
    minHeight: 56,
    backgroundColor: colors.lavender,
    borderRadius: radii.input,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pressed: {
    opacity: 0.85,
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
    paddingHorizontal: 8,
  },
  secondaryAction: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.ink,
  },
  copiedText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.forest,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.coral,
    textAlign: 'center',
  },
  caption: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 2,
  },
});
