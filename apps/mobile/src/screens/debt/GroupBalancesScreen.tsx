import { CollectPaymentButton } from '../../components/CollectPaymentButton';
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { formatVnd, type GroupBalancesDto } from '@chiane/shared';
import IconArrow from '../../../assets/figma/icon-arrow.svg';
import IconChevron from '../../../assets/figma/icon-chevron.svg';
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

type Props = NativeStackScreenProps<AppStackParamList, 'GroupBalances'>;

export function GroupBalancesScreen({ navigation, route }: Props) {
  const { groupId } = route.params;

  const [data, setData] = useState<GroupBalancesDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const loadBalances = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setErrorText(null);
      try {
        const res = await settlementsApi.getBalances(groupId);
        setData(res);
      } catch (err) {
        setErrorText(
          err instanceof ApiClientError
            ? err.message
            : 'Không thể tải số dư nhóm.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [groupId]
  );

  useFocusEffect(
    useCallback(() => {
      void loadBalances(false);
    }, [loadBalances])
  );

  const myOutgoing = data?.suggestedTransfers.find((t) => t.isFromMe);
  const myMemberRole =
    data?.memberBalances.find((m) => m.isMe)?.role ?? 'MEMBER';

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadBalances(true)}
          tintColor={colors.forest}
        />
      }
      header={
        <AppHeader
          title="Số dư nhóm"
          onBack={() => navigation.goBack()}
          rightSlot={
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => navigation.navigate('PaymentHistory', { groupId })}
            >
              <Text style={styles.historyLink}>Lịch sử</Text>
            </Pressable>
          }
        />
      }
      footer={
        myOutgoing ? (
          <ChiaNeButton
            label="Thanh toán phần của bạn"
            variant="primary"
            onPress={() =>
              navigation.navigate('Payment', {
                groupId,
                toMemberId: myOutgoing.toMemberId,
                amountVnd: myOutgoing.amountVnd,
              })
            }
          />
        ) : undefined
      }
    >
      {loading && !data ? (
        <StateView kind="loading" title="Đang tính tối ưu công nợ..." />
      ) : errorText && !data ? (
        <StateView
          kind="error"
          title="Không tải được số dư"
          description={errorText}
          actionLabel="Thử lại"
          onAction={() => void loadBalances(false)}
        />
      ) : data ? (
        <View style={styles.content}>
          <InfoCard tone="lime" style={styles.heroCard}>
            <Text style={styles.heroTitle}>
              {data.suggestedTransfers.length > 0
                ? 'Ít chuyển khoản, thêm thảnh thơi.'
                : 'Cả nhóm đã cân bằng!'}
            </Text>
            <Text style={styles.heroSub}>
              {data.suggestedTransfers.length > 0
                ? `Gộp các khoản nhỏ thành ${data.suggestedTransfers.length} lượt chuyển.\nSố tiền mỗi người không thay đổi.`
                : 'Mọi khoản chi trong nhóm đều đã được thanh toán sòng phẳng.'}
            </Text>
          </InfoCard>

          <Text style={styles.eyebrow}>SỐ DƯ TỪNG THÀNH VIÊN</Text>
          <View style={styles.card}>
            {data.memberBalances.map((member, index) => {
              const balColor =
                member.netBalanceVnd < 0
                  ? colors.coral
                  : member.netBalanceVnd > 0
                    ? colors.forest
                    : colors.muted;
              return (
                <React.Fragment key={member.memberId}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <Pressable
                    onPress={() =>
                      navigation.navigate('MemberDetails', {
                        groupId,
                        memberId: member.memberId,
                      })
                    }
                    style={styles.memberRow}
                  >
                    <Text style={styles.memberName}>
                      {member.displayName}
                      {member.isMe ? ' (bạn)' : ''}
                    </Text>
                    <Text style={[styles.memberBalance, { color: balColor }]}>
                      {formatVnd(member.netBalanceVnd, { showSign: true })}
                    </Text>
                  </Pressable>
                </React.Fragment>
              );
            })}
          </View>

          {data.pendingSettlements.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionHeading}>Đang chờ xác nhận</Text>
              <View style={styles.transferList}>
                {data.pendingSettlements.map((stl) => (
                  <Pressable
                    key={stl.id}
                    onPress={() =>
                      navigation.navigate(
                        stl.canConfirm
                          ? 'ConfirmPaymentReceived'
                          : 'WaitingConfirmation',
                        { settlementId: stl.id }
                      )
                    }
                    style={({ pressed }) => [
                      styles.pendingRow,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.pendingTextCol}>
                      <Text style={styles.pendingTitle}>
                        {`${stl.fromName} → ${stl.toName}`}
                      </Text>
                      <Text style={styles.pendingSub}>
                        {stl.canConfirm
                          ? 'Chạm để xác nhận đã nhận tiền'
                          : `Chờ ${stl.toName} xác nhận`}
                      </Text>
                    </View>
                    <View style={styles.pendingRight}>
                      <Text style={styles.transferAmount}>
                        {formatVnd(stl.amountVnd)}
                      </Text>
                      <IconChevron width={16} height={16} />
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {data.suggestedTransfers.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionHeading}>Chuyển thế này là gọn nhất</Text>
              <View style={styles.transferList}>
                {data.suggestedTransfers.map((transfer) => {
                  const canRemind = transfer.isToMe && myMemberRole !== 'GUEST';
                  const tappable = transfer.isFromMe || canRemind;
                  return (
                    <View key={`${transfer.fromMemberId}-${transfer.toMemberId}`} style={styles.transferItemGroup}>
                    <Pressable
                      disabled={!tappable}
                      onPress={() => {
                        if (transfer.isFromMe) {
                          navigation.navigate('Payment', {
                            groupId,
                            toMemberId: transfer.toMemberId,
                            amountVnd: transfer.amountVnd,
                          });
                        } else if (canRemind) {
                          navigation.navigate('FriendlyReminder', {
                            groupId,
                            recipientMemberId: transfer.fromMemberId,
                            creditorName: transfer.toName,
                            amountVnd: transfer.amountVnd,
                          });
                        }
                      }}
                      style={({ pressed }) => [
                        styles.transferRow,
                        pressed && tappable && styles.pressed,
                      ]}
                    >
                      <View style={styles.transferPeople}>
                        <Text style={styles.transferPerson}>
                          {transfer.isFromMe ? 'Bạn' : transfer.fromName}
                        </Text>
                        <IconArrow width={18} height={18} />
                        <Text style={styles.transferPerson}>
                          {transfer.isToMe ? 'Bạn' : transfer.toName}
                        </Text>
                      </View>
                      <View style={styles.transferRightCol}>
                        <Text style={styles.transferAmount}>
                          {formatVnd(transfer.amountVnd)}
                        </Text>
                        {canRemind ? (
                          <Text style={styles.remindTag}>Nhắc nhẹ</Text>
                        ) : null}
                      </View>
                    </Pressable>
                    {transfer.isToMe && (transfer.fromIsPlaceholder || myMemberRole === 'ADMIN') &&
                      <CollectPaymentButton groupId={groupId} transfer={transfer} refresh={() => loadBalances(true)} />}
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          <Text style={styles.caption}>
            Số dư cập nhật khi thanh toán được xác nhận.
          </Text>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  historyLink: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.forest,
  },
  content: {
    gap: 16,
  },
  heroCard: {
    borderRadius: radii.featureCard,
    gap: 8,
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.ink,
  },
  heroSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.ink,
  },
  eyebrow: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
    marginBottom: -4,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  memberRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memberName: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.ink,
  },
  memberBalance: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
  },
  sectionBlock: {
    gap: 10,
    marginTop: 4,
  },
  sectionHeading: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: colors.ink,
  },
  transferList: {
    gap: 10,
  },
  transferRow: {
    minHeight: 54,
    backgroundColor: colors.white,
    borderRadius: radii.input,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pendingRow: {
    minHeight: 64,
    backgroundColor: colors.lavender,
    borderRadius: radii.input,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pendingTextCol: {
    flex: 1,
    gap: 2,
  },
  pendingTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.purple,
  },
  pendingSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.purple,
  },
  pendingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pressed: {
    opacity: 0.85,
  },
  transferPeople: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  transferPerson: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.ink,
  },
  transferRightCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  transferItemGroup: {
    gap: 6,
  },
  transferAmount: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
  },
  remindTag: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: colors.purple,
  },
  caption: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
  },
});
