import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { formatVnd, type MemberDetailDto } from '@chiane/shared';
import {
  AppHeader,
  ChiaNeButton,
  ConfirmDialog,
  InfoCard,
  ScreenContainer,
  StateView,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { groupsApi } from '../../services/groupsApi';
import { colors, fonts, radii } from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'MemberDetails'>;

export function MemberDetailsScreen({ navigation, route }: Props) {
  const { groupId, memberId } = route.params;

  const [detail, setDetail] = useState<MemberDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const data = await groupsApi.getMemberDetails(groupId, memberId);
      setDetail(data);
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể tải thông tin thành viên.'
      );
    } finally {
      setLoading(false);
    }
  }, [groupId, memberId]);

  useFocusEffect(
    useCallback(() => {
      void loadDetail();
    }, [loadDetail])
  );

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await groupsApi.removeMember(groupId, memberId);
      setRemoveConfirm(false);
      navigation.goBack();
    } catch (err) {
      setRemoveConfirm(false);
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể xóa thành viên lúc này.'
      );
    } finally {
      setRemoving(false);
    }
  };

  const member = detail?.member;

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      header={
        <AppHeader
          title={member?.displayName ?? 'Chi tiết thành viên'}
          onBack={() => navigation.goBack()}
        />
      }
      footer={
        detail?.canRemove ? (
          <ChiaNeButton
            label="Xóa thành viên khỏi nhóm"
            variant="quiet"
            onPress={() => setRemoveConfirm(true)}
          />
        ) : undefined
      }
    >
      {loading && !detail ? (
        <StateView kind="loading" title="Đang tải thông tin thành viên..." />
      ) : errorText && !detail ? (
        <StateView
          kind="error"
          title="Không tải được chi tiết"
          description={errorText}
          actionLabel="Thử lại"
          onAction={() => void loadDetail()}
        />
      ) : detail && member ? (
        <View style={styles.content}>
          {errorText ? (
            <InfoCard tone="peach">
              <Text style={styles.errorText}>{errorText}</Text>
            </InfoCard>
          ) : null}

          <View style={styles.heroCard}>
            <Text style={styles.roleTag}>
              {member.role === 'ADMIN'
                ? 'TRƯỞNG NHÓM'
                : member.role === 'GUEST'
                  ? 'KHÁCH'
                  : 'THÀNH VIÊN'}
            </Text>
            <Text style={styles.memberTitle}>
              {member.displayName}
              {member.isMe ? ' (bạn)' : ''}
            </Text>
            <Text style={styles.netAmount}>
              {member.netBalanceVnd < 0
                ? `Cần trả ${formatVnd(Math.abs(member.netBalanceVnd))}`
                : member.netBalanceVnd > 0
                  ? `Được nhận ${formatVnd(member.netBalanceVnd)}`
                  : 'Đã cân bằng 0 ₫'}
            </Text>

            <View style={styles.statsRow}>
              <View style={styles.statCol}>
                <Text style={styles.statLabel}>Đã chi trả</Text>
                <Text style={styles.statValue}>{formatVnd(detail.totalPaidVnd)}</Text>
              </View>
              <View style={styles.statCol}>
                <Text style={styles.statLabel}>Phần phải chịu</Text>
                <Text style={styles.statValue}>{formatVnd(detail.totalShareVnd)}</Text>
              </View>
            </View>
          </View>

          {member.bankPreview?.hasRealBank ? (
            <InfoCard tone="white" style={styles.bankCard}>
              <Text style={styles.sectionEyebrow}>TÀI KHOẢN NGÂN HÀNG</Text>
              <Text style={styles.bankHolder}>
                {member.bankPreview.bankAccountHolder || member.displayName}
              </Text>
              <Text style={styles.bankMeta}>
                {member.bankPreview.bankName} · {member.bankPreview.maskedAccountNumber}
              </Text>
            </InfoCard>
          ) : null}

          <Text style={styles.sectionHeading}>
            Lịch sử giao dịch ({detail.transactions.length})
          </Text>

          {detail.transactions.length === 0 ? (
            <StateView
              kind="empty"
              title="Chưa có giao dịch"
              description="Khoản chi và thanh toán liên quan tới thành viên này sẽ hiển thị tại đây."
            />
          ) : (
            <View style={styles.txCard}>
              {detail.transactions.map((tx, index) => (
                <React.Fragment key={`${tx.kind}-${tx.id}`}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <View style={styles.txRow}>
                    <View style={styles.txTextCol}>
                      <Text style={styles.txTitle}>{tx.title}</Text>
                      <Text style={styles.txSub}>{tx.subtitle}</Text>
                    </View>
                    <Text style={styles.txAmount}>{formatVnd(tx.amountVnd)}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          )}
        </View>
      ) : null}

      <ConfirmDialog
        visible={removeConfirm}
        title="Xóa thành viên này?"
        description="Thành viên sẽ không còn quyền xem nhóm. Lịch sử các khoản chi cũ vẫn được giữ nguyên."
        confirmLabel="Xóa khỏi nhóm"
        destructive
        loading={removing}
        onConfirm={() => void handleRemove()}
        onCancel={() => setRemoveConfirm(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.coral,
  },
  heroCard: {
    backgroundColor: colors.forest,
    borderRadius: radii.heroCard,
    padding: 20,
    gap: 8,
  },
  roleTag: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: colors.lime,
  },
  memberTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.white,
  },
  netAmount: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.lime,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },
  statCol: {
    flex: 1,
    gap: 2,
  },
  statLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.onForestLabel,
  },
  statValue: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.white,
  },
  bankCard: {
    gap: 4,
  },
  sectionEyebrow: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: colors.muted,
  },
  bankHolder: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.ink,
  },
  bankMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
  sectionHeading: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.ink,
  },
  txCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  txRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
  },
  txTextCol: {
    flex: 1,
    gap: 2,
  },
  txTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
  },
  txSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
  },
  txAmount: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
  },
});
