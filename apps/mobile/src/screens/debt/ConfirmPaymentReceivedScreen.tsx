import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { formatVnd, type SettlementDto } from '@chiane/shared';
import IconShield from '../../../assets/figma/icon-shield.svg';
import {
  AppHeader,
  ChiaNeButton,
  ChiaNeInput,
  ConfirmDialog,
  ScreenContainer,
  StateView,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { settlementsApi } from '../../services/settlementsApi';
import { colors, fonts, radii, tabularNums } from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'ConfirmPaymentReceived'>;

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Vừa xong';
  const d = new Date(iso);
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = d.getHours().toString().padStart(2, '0');
  const mi = d.getMinutes().toString().padStart(2, '0');
  return `${dd}/${mm}/${yyyy} · ${hh}:${mi}`;
}

export function ConfirmPaymentReceivedScreen({ navigation, route }: Props) {
  const { settlementId } = route.params;

  const [settlement, setSettlement] = useState<SettlementDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

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
          : 'Không thể tải thông tin thanh toán.'
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

  const handleConfirm = async () => {
    setConfirming(true);
    setErrorText(null);
    try {
      await settlementsApi.confirmSettlement(settlementId);
      navigation.replace('PaymentCompleted', { settlementId });
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể xác nhận thanh toán lúc này.'
      );
    } finally {
      setConfirming(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    setErrorText(null);
    try {
      await settlementsApi.rejectSettlement(
        settlementId,
        rejectReason.trim() || undefined
      );
      setRejectOpen(false);
      navigation.goBack();
    } catch (err) {
      setRejectOpen(false);
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể từ chối khoản thanh toán.'
      );
    } finally {
      setRejecting(false);
    }
  };

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      header={
        <AppHeader
          title="Xác nhận thanh toán"
          onBack={() => navigation.goBack()}
        />
      }
      footer={
        settlement?.canConfirm ? (
          <ChiaNeButton
            label={settlement.canReject ? 'Tôi đã nhận đủ tiền' : `Xác nhận đã trả cho ${settlement.toName}`}
            variant="primary"
            loading={confirming}
            onPress={() => void handleConfirm()}
          />
        ) : undefined
      }
    >
      {loading && !settlement ? (
        <StateView kind="loading" title="Đang tải thông tin..." />
      ) : errorText && !settlement ? (
        <StateView
          kind="error"
          title="Không tải được khoản thanh toán"
          description={errorText}
          actionLabel="Thử lại"
          onAction={() => void loadSettlement()}
        />
      ) : settlement ? (
        <View style={styles.content}>
          <Text style={styles.senderCaption}>
            {`${settlement.fromName} báo đã trả cho ${settlement.toName}`}
          </Text>
          <Text style={[styles.amount, tabularNums]}>{formatVnd(settlement.amountVnd)}</Text>

          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Người gửi</Text>
              <Text style={styles.detailValue}>{settlement.fromName}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Nhóm</Text>
              <Text style={styles.detailValue}>{settlement.groupName}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Phương thức</Text>
              <Text style={styles.detailValue}>
                {settlement.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Thời gian</Text>
              <Text style={styles.detailValue}>
                {formatDateTime(settlement.reportedAt ?? settlement.createdAt)}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Trạng thái</Text>
              <Text style={[styles.detailValue, styles.pendingValue]}>
                {settlement.status === 'REPORTED'
                  ? 'Chờ bạn xác nhận'
                  : settlement.status === 'CONFIRMED'
                    ? 'Đã xác nhận'
                    : 'Đã từ chối'}
              </Text>
            </View>
          </View>

          <View style={styles.peachWarning}>
            <IconShield width={25} height={25} />
            <View style={styles.warningTextCol}>
              <Text style={styles.warningTitle}>Kiểm tra khoản thanh toán nhé</Text>
              <Text style={styles.warningBody}>
                {`Chỉ xác nhận khi ${settlement.toName} đã nhận đủ ${formatVnd(settlement.amountVnd)}.`}
              </Text>
            </View>
          </View>

          {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

          {settlement.canReject ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setRejectOpen(true)}
              style={styles.rejectLinkWrap}
            >
              <Text style={styles.rejectLink}>Tôi chưa nhận được tiền</Text>
            </Pressable>
          ) : null}

          <Text style={styles.footerHint}>
            {`Người nhận · ${settlement.toName}`}
          </Text>
        </View>
      ) : null}

      <ConfirmDialog
        visible={rejectOpen}
        title="Báo chưa nhận được tiền?"
        description="Khoản thanh toán sẽ chuyển sang trạng thái bị từ chối và số dư nhóm giữ nguyên để hai bạn kiểm tra lại."
        confirmLabel="Xác nhận chưa nhận"
        destructive
        loading={rejecting}
        onConfirm={() => void handleReject()}
        onCancel={() => setRejectOpen(false)}
      >
        <ChiaNeInput
          label="Lý do (không bắt buộc)"
          value={rejectReason}
          onChangeText={setRejectReason}
          placeholder="Ví dụ: Chưa thấy tiền vào tài khoản"
          maxLength={240}
        />
      </ConfirmDialog>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  senderCaption: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
  },
  amount: {
    fontFamily: fonts.bold,
    fontSize: 38,
    lineHeight: 48,
    color: colors.ink,
  },
  detailsCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    paddingHorizontal: 16,
  },
  detailRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
  detailValue: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.ink,
    textAlign: 'right',
    flexShrink: 1,
  },
  pendingValue: {
    color: colors.purple,
    fontFamily: fonts.semiBold,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
  },
  peachWarning: {
    backgroundColor: colors.peach,
    borderRadius: radii.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  warningTextCol: {
    flex: 1,
    gap: 4,
  },
  warningTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.coral,
  },
  warningBody: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.coral,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.coral,
  },
  rejectLinkWrap: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  rejectLink: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.coral,
  },
  footerHint: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
  },
});
