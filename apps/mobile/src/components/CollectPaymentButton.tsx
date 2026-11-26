import React, { useRef, useState } from 'react';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { formatVnd, type SuggestedTransferDto } from '@chiane/shared';
import { settlementsApi } from '../services/settlementsApi';
import { colors, fonts } from '../theme/tokens';
import { ConfirmDialog } from './ConfirmDialog';
import { ScalePressable, showToast } from './motion';

export function CollectPaymentButton({
  groupId,
  transfer,
  refresh,
  style,
}: {
  groupId: string;
  transfer: SuggestedTransferDto;
  refresh: () => Promise<void>;
  style?: StyleProp<ViewStyle>;
}) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = useRef<string | null>(null);

  async function collect() {
    if (busy) return;
    setBusy(true);
    key.current ??= `cash_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try {
      await settlementsApi.reportSettlement(groupId, {
        fromMemberId: transfer.fromMemberId,
        toMemberId: transfer.toMemberId,
        amountVnd: transfer.amountVnd,
        method: 'CASH',
        autoConfirm: true,
        idempotencyKey: key.current,
      });
      key.current = null;
      setVisible(false);
      showToast('Đã ghi nhận tiền bạn nhận.');
      await refresh();
    } catch (error) {
      setVisible(false);
      showToast({
        message: error instanceof Error ? error.message : 'Chưa ghi nhận được thanh toán.',
        tone: 'warning',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ScalePressable
        accessibilityRole="button"
        onPress={() => setVisible(true)}
        scaleTo={0.96}
        style={[styles.btn, style]}
      >
        <Text style={styles.btnText} numberOfLines={1}>
          ✓ Đã thu tiền
        </Text>
      </ScalePressable>
      <ConfirmDialog
        visible={visible}
        title="Bạn đã nhận đủ tiền?"
        description={`Ghi nhận ${formatVnd(transfer.amountVnd)} từ ${transfer.fromName} và cập nhật số dư nhóm.`}
        confirmLabel="Đã nhận đủ"
        loading={busy}
        onConfirm={() => void collect()}
        onCancel={() => setVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: colors.sage,
    borderWidth: 1,
    borderColor: 'rgba(23, 62, 50, 0.16)',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.forest,
  },
});
