import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import {
  buildVietQrPayload,
  formatVnd,
  parseVndInput,
  type ExpenseDto,
  type GroupPotDto,
  type GroupPotMemberSummaryDto,
  type SettlementDto,
} from '@chiane/shared';
import IconChevron from '../../../assets/figma/icon-chevron.svg';
import IconPlusLight from '../../../assets/figma/icon-plus-light.svg';
import IconPlus from '../../../assets/figma/icon-plus.svg';
import {
  AppHeader,
  ChiaNeButton,
  ChiaNeChip,
  ChiaNeInput,
  ConfirmDialog,
  ExpenseRow,
  GROUP_CATEGORY_META,
  IconGear,
  IconUserPlus,
  LuckyWheelModal,
  ScreenContainer,
  StateView,
  VietQrMatrix,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { groupsApi } from '../../services/groupsApi';
import { potApi } from '../../services/potApi';
import { settlementsApi } from '../../services/settlementsApi';
import { useAuthStore } from '../../store/authStore';
import { useExpenseDraftStore } from '../../store/expenseDraftStore';
import { useGroupsStore } from '../../store/groupsStore';
import { colors, fonts, radii, sizes, typography } from '../../theme/tokens';
import {
  calculateTripRecap,
  type TripRecapData,
} from '../../utils/recapCalculator';
import { TripRecapModal } from './TripRecapModal';

type Props = NativeStackScreenProps<AppStackParamList, 'GroupDetails'>;

type DetailTab = 'EXPENSES' | 'BALANCES' | 'MEMBERS';

function formatMonthBucket(iso: string): string {
  const d = new Date(iso);
  return `Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
}

export function GroupDetailsScreen({ navigation, route }: Props) {
  const { groupId } = route.params;
  const cachedGroup = useGroupsStore((s) => s.groupDetailsById[groupId]);
  const fetchGroupDetail = useGroupsStore((s) => s.fetchGroupDetail);

  const [group, setGroup] = useState(cachedGroup ?? null);
  const [activeTab, setActiveTab] = useState<DetailTab>('EXPENSES');
  const [loading, setLoading] = useState(!cachedGroup);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [leaveGuestConfirmOpen, setLeaveGuestConfirmOpen] = useState(false);
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [addingMember, setAddingMember] = useState(false);

  const [pot, setPot] = useState<GroupPotDto | null>(null);
  const [luckyWheelOpen, setLuckyWheelOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapData, setRecapData] = useState<TripRecapData | null>(null);
  const [potContributeOpen, setPotContributeOpen] = useState(false);
  const [potDetailOpen, setPotDetailOpen] = useState(false);
  const [potMemberId, setPotMemberId] = useState('');
  const [potAmountVnd, setPotAmountVnd] = useState(500_000);
  const [potNote, setPotNote] = useState('');
  const [potError, setPotError] = useState<string | null>(null);
  const [potSubmitting, setPotSubmitting] = useState(false);
  const [potPayMethod, setPotPayMethod] = useState<'BANK_TRANSFER' | 'CASH'>('BANK_TRANSFER');
  const [custodianPickerOpen, setCustodianPickerOpen] = useState(false);
  const [updatingCustodian, setUpdatingCustodian] = useState(false);
  const [copiedQrNotice, setCopiedQrNotice] = useState<string | null>(null);
  const [refundQrTarget, setRefundQrTarget] = useState<GroupPotMemberSummaryDto | null>(null);

  const loadGroup = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else if (!useGroupsStore.getState().groupDetailsById[groupId]) {
        setLoading(true);
      }
      setErrorText(null);
      try {
        const [detail, potRes] = await Promise.all([
          fetchGroupDetail(groupId),
          potApi.getPot(groupId).catch(() => null),
        ]);
        setGroup(detail);
        if (potRes) {
          setPot(potRes);
        }
      } catch (err) {
        setErrorText(
          err instanceof ApiClientError
            ? err.message
            : 'Không thể tải chi tiết nhóm.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchGroupDetail, groupId]
  );

  useFocusEffect(
    useCallback(() => {
      void loadGroup(false);
    }, [loadGroup])
  );

  const groupedExpenses = useMemo(() => {
    if (!group) return [] as Array<{ label: string; items: ExpenseDto[] }>;
    const buckets = new Map<string, ExpenseDto[]>();
    for (const exp of group.expenses) {
      const label = formatMonthBucket(exp.expenseDate);
      const list = buckets.get(label) ?? [];
      list.push(exp);
      buckets.set(label, list);
    }
    return Array.from(buckets.entries()).map(([label, items]) => ({ label, items }));
  }, [group]);

  const handleAddMemberSubmit = async () => {
    const trimmed = newMemberName.trim();
    if (!trimmed) {
      setAddMemberError('Vui lòng nhập tên thành viên.');
      return;
    }
    setAddingMember(true);
    setAddMemberError(null);
    try {
      await groupsApi.addMember(groupId, {
        displayName: trimmed,
        ...(newMemberPhone.trim() ? { phone: newMemberPhone.trim() } : {}),
      });
      setAddMemberOpen(false);
      setNewMemberName('');
      setNewMemberPhone('');
      await loadGroup(false);
    } catch (err) {
      setAddMemberError(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể thêm thành viên.'
      );
    } finally {
      setAddingMember(false);
    }
  };

  const handleOpenRecap = async () => {
    if (!group) return;
    const settlements = await settlementsApi
      .listSettlements(group.id)
      .then((res) => res.settlements)
      .catch(() => [] as SettlementDto[]);
    setRecapData(calculateTripRecap(group, settlements));
    setRecapOpen(true);
  };

  const handleOpenPotContribute = () => {
    if (!group) return;
    setPotMemberId(group.myMemberId);
    setPotAmountVnd(500_000);
    setPotNote('');
    setPotError(null);
    setPotPayMethod('BANK_TRANSFER');
    setCustodianPickerOpen(false);
    setCopiedQrNotice(null);
    setPotContributeOpen(true);
  };

  const copyQrValue = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value);
    setCopiedQrNotice(`Đã sao chép ${label}!`);
    setTimeout(() => setCopiedQrNotice(null), 2200);
  };

  const handleChangeCustodian = async (memberId: string) => {
    if (!group || updatingCustodian) return;
    setUpdatingCustodian(true);
    setPotError(null);
    try {
      const nextPot = await potApi.setCustodian(group.id, memberId);
      setPot(nextPot);
      setCustodianPickerOpen(false);
    } catch (err) {
      setPotError(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể cập nhật Thủ quỹ lúc này.'
      );
    } finally {
      setUpdatingCustodian(false);
    }
  };

  const handleContributePotSubmit = async () => {
    if (!group) return;
    if (potAmountVnd <= 0) {
      setPotError('Vui lòng nhập số tiền góp quỹ lớn hơn 0 ₫.');
      return;
    }
    setPotSubmitting(true);
    setPotError(null);
    try {
      const targetMemberId =
        group.myRole === 'GUEST'
          ? group.myMemberId
          : potMemberId || group.myMemberId;
      const defaultNote =
        potPayMethod === 'BANK_TRANSFER'
          ? 'Chuyển khoản VietQR cho Thủ quỹ'
          : 'Nộp tiền mặt cho Thủ quỹ';
      const finalNote = potNote.trim() || defaultNote;
      const res = await potApi.contribute(group.id, {
        memberId: targetMemberId,
        amountVnd: potAmountVnd,
        note: finalNote,
      });
      setPot(res.pot);
      setPotContributeOpen(false);
      void loadGroup(false);
    } catch (err) {
      setPotError(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể ghi nhận tiền góp quỹ lúc này.'
      );
    } finally {
      setPotSubmitting(false);
    }
  };

  const categoryMeta = group
    ? GROUP_CATEGORY_META[group.category]
    : GROUP_CATEGORY_META.HOUSEHOLD;
  const CategoryIcon = categoryMeta.Icon;

  const hasPotActivity =
    Boolean(pot) &&
    ((pot?.totalContributedVnd ?? 0) > 0 || (pot?.totalSpentFromPotVnd ?? 0) > 0);
  const potProgressPct =
    pot && pot.totalContributedVnd > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round((pot.remainingPotVnd / pot.totalContributedVnd) * 100)
          )
        )
      : 0;

  const socialFunRow = group ? (
    <View style={styles.socialFunRow}>
      {group.members.length >= 2 && !group.isArchived ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setLuckyWheelOpen(true)}
          style={({ pressed }) => [styles.funPillBtn, styles.funPillLavender, pressed && styles.pressed]}
        >
          <Text style={styles.funPillLavenderText}>🎡 Quay người bao</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => void handleOpenRecap()}
        style={({ pressed }) => [styles.funPillBtn, styles.funPillForest, pressed && styles.pressed]}
      >
        <Text style={styles.funPillForestText}>🏆 Tổng kết chuyến đi</Text>
      </Pressable>
    </View>
  ) : null;

  const custodian = pot?.custodian ?? null;
  const contributorName =
    group?.members.find((m) => m.id === (potMemberId || group.myMemberId))
      ?.displayName ?? 'THANH VIEN';
  const potContributeMemo = `CHIANE GOP QUY ${contributorName}`;
  const potVietQrPayload = custodian?.bankPreview.hasRealBank
    ? buildVietQrPayload({
        bankBin: custodian.bankPreview.bankBin,
        accountNumber: custodian.bankPreview.bankAccountNumber,
        amountVnd: potAmountVnd > 0 ? potAmountVnd : undefined,
        memo: potContributeMemo,
      })
    : null;

  const refundMemo = refundQrTarget
    ? `CHIANE HOAN QUY ${refundQrTarget.displayName}`
    : '';
  const refundVietQrPayload =
    refundQrTarget && refundQrTarget.bankPreview?.hasRealBank
      ? buildVietQrPayload({
          bankBin: refundQrTarget.bankPreview.bankBin,
          accountNumber: refundQrTarget.bankPreview.bankAccountNumber,
          amountVnd: refundQrTarget.netRefundVnd > 0 ? refundQrTarget.netRefundVnd : undefined,
          memo: refundMemo,
        })
      : null;

  const potSummaryCard = group ? (
    hasPotActivity && pot ? (
      <View style={styles.potCard}>
        <View style={styles.potHeaderRow}>
          <View style={styles.potTitleCol}>
            <Text style={styles.potTitle}>🐷 Quỹ chung nhóm</Text>
            <Text
              style={[
                styles.potRemainingText,
                pot.remainingPotVnd < 0 && styles.potNegativeText,
              ]}
            >
              {`Quỹ còn lại: ${formatVnd(pot.remainingPotVnd)} / ${formatVnd(
                pot.totalContributedVnd
              )}`}
            </Text>
          </View>
          {!group.isArchived ? (
            <Pressable
              accessibilityRole="button"
              onPress={handleOpenPotContribute}
              style={({ pressed }) => [styles.potAddBtn, pressed && styles.pressed]}
            >
              <Text style={styles.potAddBtnText}>+ Góp quỹ</Text>
            </Pressable>
          ) : null}
        </View>
        {custodian ? (
          <Text style={styles.potCustodianLine} numberOfLines={1}>
            {`🏦 Thủ quỹ giữ tiền: ${custodian.displayName}${
              custodian.bankPreview.bankName
                ? ` (${custodian.bankPreview.bankName})`
                : ''
            }`}
          </Text>
        ) : null}
        <View style={styles.potProgressTrack}>
          <View
            style={[
              styles.potProgressFill,
              {
                width: `${potProgressPct}%`,
                backgroundColor:
                  pot.remainingPotVnd < 0 ? colors.coral : colors.forest,
              },
            ]}
          />
        </View>
        <View style={styles.potFooterRow}>
          <Text style={styles.potMetaText}>
            {`Đã chi từ quỹ: ${formatVnd(pot.totalSpentFromPotVnd)}`}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setPotDetailOpen(true)}
            hitSlop={6}
          >
            <Text style={styles.potDetailLink}>Chi tiết / Hoàn quỹ ›</Text>
          </Pressable>
        </View>
      </View>
    ) : (
      <View style={styles.potEmptyCard}>
        <View style={styles.potTitleCol}>
          <Text style={styles.potTitle}>🐷 Quỹ chung nhóm (Heo đất)</Text>
          <Text style={styles.potMetaText}>
            {custodian
              ? `Góp trước vào TK Thủ quỹ (${custodian.displayName}), chi tới đâu trừ tới đó.`
              : 'Góp trước đầu chuyến, chi tới đâu trừ quỹ tới đó.'}
          </Text>
        </View>
        {!group.isArchived ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleOpenPotContribute}
            style={({ pressed }) => [styles.potAddBtn, pressed && styles.pressed]}
          >
            <Text style={styles.potAddBtnText}>+ Góp quỹ</Text>
          </Pressable>
        ) : null}
      </View>
    )
  ) : null;

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadGroup(true)}
          tintColor={colors.forest}
        />
      }
      header={
        <AppHeader
          title={group?.name ?? 'Chi tiết nhóm'}
          onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
          rightSlot={
            group ? (
              <View style={styles.headerActions}>
                {group.myRole !== 'GUEST' ? (
                  <Pressable
                    accessibilityLabel="Cài đặt nhóm"
                    hitSlop={8}
                    onPress={() =>
                      navigation.navigate('GroupSettings', { groupId: group.id })
                    }
                    style={styles.iconActionBtn}
                  >
                    <IconGear width={22} height={22} />
                  </Pressable>
                ) : null}
                {!group.isArchived ? (
                  <Pressable
                    accessibilityLabel="Thêm khoản chi"
                    hitSlop={8}
                    onPress={() =>
                      navigation.navigate('AddExpense', { groupId: group.id })
                    }
                    style={styles.iconActionBtn}
                  >
                    <IconPlus width={23} height={23} />
                  </Pressable>
                ) : null}
              </View>
            ) : undefined
          }
        />
      }
    >
      {loading && !group ? (
        <StateView kind="loading" title="Đang tải thông tin nhóm..." />
      ) : errorText && !group ? (
        <StateView
          kind="error"
          title="Chưa tải được nhóm"
          description={errorText}
          actionLabel="Thử lại"
          onAction={() => void loadGroup(false)}
        />
      ) : group ? (
        <View style={styles.content}>
          {group.isArchived ? (
            <View style={styles.archivedBanner}>
              <Text style={styles.archivedText}>
                Nhóm này đang ở chế độ lưu trữ (chỉ xem).
              </Text>
            </View>
          ) : null}

          {group.myRole === 'GUEST' ? (
            <View style={styles.guestBanner}>
              <View style={styles.guestTextCol}>
                <Text style={styles.guestTitle}>
                  Đang tham gia với tư cách Khách
                </Text>
                <Text style={styles.guestSub}>
                  Đăng ký SĐT để lưu nhóm vĩnh viễn và dùng đầy đủ tính năng.
                </Text>
              </View>
              <View style={styles.guestActionsRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => useAuthStore.getState().startGuestUpgrade()}
                  style={({ pressed }) => [styles.guestPrimaryBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.guestPrimaryBtnText}>Đăng ký SĐT</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setLeaveGuestConfirmOpen(true)}
                  style={({ pressed }) => [styles.guestQuitBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.guestQuitBtnText}>Thoát</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {group.expenses.length === 0 && activeTab === 'EXPENSES' ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyHeroCard}>
                <View style={styles.emptyIconBox}>
                  <CategoryIcon width={48} height={48} />
                </View>
                <Text style={styles.emptyHeading}>
                  {`${group.name},\nchi tiêu cũng chung.`}
                </Text>
                <Text style={styles.emptySub}>
                  {
                    'Chưa có khoản chi nào.\nGhi khoản chi đầu tiên để cả hội cùng theo dõi rõ ràng nhé.'
                  }
                </Text>
              </View>

              <View style={styles.emptyTabsRow}>
                <ChiaNeChip
                  label="Khoản chi"
                  active
                  onPress={() => setActiveTab('EXPENSES')}
                />
                <ChiaNeChip
                  label="Số dư"
                  active={false}
                  onPress={() => setActiveTab('BALANCES')}
                />
                <ChiaNeChip
                  label={`Thành viên (${group.memberCount})`}
                  active={false}
                  onPress={() => setActiveTab('MEMBERS')}
                />
              </View>

              {socialFunRow}
              {potSummaryCard}

              {!group.isArchived ? (
                <View style={styles.emptyActions}>
                  <ChiaNeButton
                    label="+  Thêm khoản chi đầu tiên"
                    variant="primary"
                    onPress={() =>
                      navigation.navigate('AddExpense', { groupId: group.id })
                    }
                  />
                  {group.myRole !== 'GUEST' ? (
                    <ChiaNeButton
                      label="Mời bạn bè vào nhóm"
                      variant="secondary"
                      onPress={() =>
                        navigation.navigate('InviteFriends', { groupId: group.id })
                      }
                    />
                  ) : null}
                </View>
              ) : null}

              <Text style={styles.emptyFooter}>
                {`${group.memberCount} thành viên · Mọi số dư đang cân bằng`}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryMeta}>
                  {`${group.memberCount} thành viên · ${group.expenseCount} khoản chi`}
                </Text>
                <View style={styles.summaryBottomRow}>
                  <View style={styles.summaryAmountCol}>
                    <Text style={styles.summaryLabel}>Cả nhóm đã chi</Text>
                    <Text style={styles.summaryAmount}>
                      {formatVnd(group.totalSpentVnd)}
                    </Text>
                  </View>
                  {!group.isArchived ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Thêm khoản chi nhanh"
                      onPress={() =>
                        navigation.navigate('AddExpense', { groupId: group.id })
                      }
                      style={({ pressed }) => [
                        styles.addFab,
                        pressed && styles.pressed,
                      ]}
                    >
                      <IconPlusLight width={24} height={24} />
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {socialFunRow}
              {potSummaryCard}

              <View style={styles.tabsRow}>
                <ChiaNeChip
                  label="Khoản chi"
                  active={activeTab === 'EXPENSES'}
                  onPress={() => setActiveTab('EXPENSES')}
                  style={styles.tabChip}
                />
                <ChiaNeChip
                  label="Số dư"
                  active={activeTab === 'BALANCES'}
                  onPress={() => setActiveTab('BALANCES')}
                  style={styles.tabChip}
                />
                <ChiaNeChip
                  label="Thành viên"
                  active={activeTab === 'MEMBERS'}
                  onPress={() => setActiveTab('MEMBERS')}
                  style={styles.tabChip}
                />
              </View>

              {activeTab === 'EXPENSES' ? (
                <View style={styles.tabBody}>
                  {groupedExpenses.map((bucket) => (
                    <View key={bucket.label} style={styles.bucketWrap}>
                      <View style={styles.bucketHeader}>
                        <Text style={styles.bucketTitle}>{bucket.label}</Text>
                        <Text style={styles.bucketCount}>
                          {bucket.items.length} khoản
                        </Text>
                      </View>
                      <View style={styles.expenseList}>
                        {bucket.items.map((exp) => (
                          <ExpenseRow
                            key={exp.id}
                            title={exp.title}
                            subtitle={`${
                              exp.isPaidFromPot
                                ? '🐷 Quỹ chung đã chi'
                                : `${exp.paidByName} đã trả`
                            } · ${exp.splitCount} người`}
                            amountText={formatVnd(exp.amountVnd)}
                            category={exp.category}
                            onPress={() =>
                              navigation.navigate('ExpenseDetails', {
                                expenseId: exp.id,
                              })
                            }
                          />
                        ))}
                      </View>
                    </View>
                  ))}
                  <Text style={styles.quoteFooter}>
                    Ghi đủ hôm nay, khỏi quên ngày mai.
                  </Text>
                </View>
              ) : null}

              {activeTab === 'BALANCES' ? (
                <View style={styles.tabBody}>
                  <View style={styles.membersCard}>
                    {group.members.map((member, index) => {
                      const balColor =
                        member.netBalanceVnd < 0
                          ? colors.coral
                          : member.netBalanceVnd > 0
                            ? colors.forest
                            : colors.muted;
                      return (
                        <React.Fragment key={member.id}>
                          {index > 0 ? <View style={styles.divider} /> : null}
                          <Pressable
                            onPress={() =>
                              navigation.navigate('MemberDetails', {
                                groupId: group.id,
                                memberId: member.id,
                              })
                            }
                            style={styles.balanceRow}
                          >
                            <Text style={styles.memberName}>
                              {member.displayName}
                              {member.isMe ? ' (bạn)' : ''}
                            </Text>
                            <Text style={[styles.balanceValue, { color: balColor }]}>
                              {formatVnd(member.netBalanceVnd, { showSign: true })}
                            </Text>
                          </Pressable>
                        </React.Fragment>
                      );
                    })}
                  </View>

                  <ChiaNeButton
                    label="Xem gợi ý chuyển khoản & thanh toán"
                    variant="primary"
                    onPress={() =>
                      navigation.navigate('GroupBalances', { groupId: group.id })
                    }
                  />
                </View>
              ) : null}

              {activeTab === 'MEMBERS' ? (
                <View style={styles.tabBody}>
                  <View style={styles.membersCard}>
                    {group.members.map((member, index) => (
                      <React.Fragment key={member.id}>
                        {index > 0 ? <View style={styles.divider} /> : null}
                        <Pressable
                          onPress={() =>
                            navigation.navigate('MemberDetails', {
                              groupId: group.id,
                              memberId: member.id,
                            })
                          }
                          style={({ pressed }) => [
                            styles.balanceRow,
                            pressed && styles.pressed,
                          ]}
                        >
                          <View style={styles.memberInfoCol}>
                            <Text style={styles.memberName}>
                              {member.displayName}
                              {member.isMe ? ' (bạn)' : ''}
                            </Text>
                            <Text style={styles.memberRole}>
                              {member.role === 'ADMIN'
                                ? 'Trưởng nhóm'
                                : member.role === 'GUEST'
                                  ? 'Khách'
                                  : 'Thành viên'}
                            </Text>
                          </View>
                          <View style={styles.memberRightCol}>
                            <Text
                              style={[
                                styles.balanceValue,
                                {
                                  color:
                                    member.netBalanceVnd < 0
                                      ? colors.coral
                                      : member.netBalanceVnd > 0
                                        ? colors.forest
                                        : colors.muted,
                                },
                              ]}
                            >
                              {formatVnd(member.netBalanceVnd, { showSign: true })}
                            </Text>
                            <IconChevron width={16} height={16} />
                          </View>
                        </Pressable>
                      </React.Fragment>
                    ))}
                  </View>

                  {!group.isArchived && group.myRole !== 'GUEST' ? (
                    <View style={styles.memberActionsStack}>
                      <ChiaNeButton
                        label="Mời bạn bè qua liên kết"
                        variant="secondary"
                        onPress={() =>
                          navigation.navigate('InviteFriends', { groupId: group.id })
                        }
                      />
                      {group.myRole === 'ADMIN' ? (
                        <Pressable
                          onPress={() => {
                            setAddMemberError(null);
                            setAddMemberOpen(true);
                          }}
                          style={styles.quickAddMemberBtn}
                        >
                          <IconUserPlus width={18} height={18} color={colors.forest} />
                          <Text style={styles.quickAddMemberText}>
                            Thêm thành viên thủ công
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      <Modal
        visible={addMemberOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAddMemberOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={addingMember ? undefined : () => setAddMemberOpen(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Thêm thành viên</Text>
            <Text style={styles.modalDesc}>
              Nhập tên thành viên (và SĐT nếu muốn liên kết tài khoản ChiaNè của bạn đó).
            </Text>
            <ChiaNeInput
              label="Tên hiển thị"
              value={newMemberName}
              onChangeText={(t) => {
                setNewMemberName(t);
                if (addMemberError) setAddMemberError(null);
              }}
              placeholder="Ví dụ: Huy"
              errorText={addMemberError}
            />
            <ChiaNeInput
              label="Số điện thoại (không bắt buộc)"
              value={newMemberPhone}
              onChangeText={setNewMemberPhone}
              placeholder="0912 345 678"
              keyboardType="phone-pad"
            />
            <View style={styles.modalActions}>
              <ChiaNeButton
                label="Thêm vào nhóm"
                variant="primary"
                loading={addingMember}
                onPress={() => void handleAddMemberSubmit()}
              />
              <ChiaNeButton
                label="Đóng"
                variant="quiet"
                disabled={addingMember}
                onPress={() => setAddMemberOpen(false)}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Contribute Pot Modal */}
      <Modal
        visible={potContributeOpen}
        transparent
        animationType="fade"
        onRequestClose={potSubmitting ? undefined : () => setPotContributeOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={potSubmitting ? undefined : () => setPotContributeOpen(false)}
        >
          <Pressable
            style={[styles.modalCard, styles.potContributeModalCard]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>🐷 Góp quỹ chung nhóm</Text>
            <ScrollView
              style={styles.potContributeScroll}
              contentContainerStyle={styles.potContributeScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Custodian Banner & Switcher */}
              <View style={styles.custodianBox}>
                <View style={styles.custodianHeaderRow}>
                  <View style={styles.custodianTextCol}>
                    <Text style={styles.custodianEyebrow}>🏦 THỦ QUỸ GIỮ TIỀN</Text>
                    <Text style={styles.custodianName}>
                      {custodian
                        ? `${custodian.displayName}${custodian.isMe ? ' (bạn)' : ''}`
                        : 'Trưởng nhóm'}
                    </Text>
                    {custodian?.bankPreview.hasRealBank ? (
                      <Text style={styles.custodianBankSub}>
                        {`${custodian.bankPreview.bankName} · ${custodian.bankPreview.maskedAccountNumber ?? custodian.bankPreview.bankAccountNumber}`}
                      </Text>
                    ) : (
                      <Text style={styles.custodianNoBankSub}>
                        Chưa liên kết tài khoản ngân hàng
                      </Text>
                    )}
                  </View>
                  {group && group.myRole !== 'GUEST' && !group.isArchived ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setCustodianPickerOpen((prev) => !prev)}
                      style={({ pressed }) => [styles.changeCustodianBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.changeCustodianBtnText}>
                        {custodianPickerOpen ? 'Đóng' : 'Đổi Thủ quỹ'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {custodianPickerOpen && group ? (
                  <View style={styles.custodianPickerWrap}>
                    <Text style={styles.potFieldLabel}>
                      {updatingCustodian ? 'Đang cập nhật Thủ quỹ...' : 'Chọn thành viên giữ quỹ:'}
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.potChipRow}
                    >
                      {group.members.map((m) => (
                        <ChiaNeChip
                          key={m.id}
                          label={`${m.displayName}${m.bankPreview?.hasRealBank ? ' 🏦' : ''}`}
                          active={custodian?.memberId === m.id}
                          onPress={() => void handleChangeCustodian(m.id)}
                        />
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
              </View>

              {/* Contributor Picker */}
              {group ? (
                group.myRole === 'GUEST' ? (
                  <View style={styles.potGuestBox}>
                    <Text style={styles.potGuestText}>
                      Người góp quỹ: {group.members.find((m) => m.id === group.myMemberId)?.displayName ?? 'Bạn'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.potMemberPicker}>
                    <Text style={styles.potFieldLabel}>Người góp quỹ</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.potChipRow}
                    >
                      {group.members.map((m) => (
                        <ChiaNeChip
                          key={m.id}
                          label={`${m.displayName}${m.isMe ? ' (bạn)' : ''}`}
                          active={(potMemberId || group.myMemberId) === m.id}
                          onPress={() => setPotMemberId(m.id)}
                        />
                      ))}
                    </ScrollView>
                  </View>
                )
              ) : null}

              <ChiaNeInput
                label="Số tiền góp (₫)"
                value={
                  potAmountVnd > 0
                    ? formatVnd(potAmountVnd, { includeSymbol: false })
                    : ''
                }
                onChangeText={(raw) => {
                  setPotAmountVnd(parseVndInput(raw));
                  if (potError) setPotError(null);
                }}
                keyboardType="number-pad"
                placeholder="500.000"
                errorText={potError}
              />

              <View style={styles.potPresetRow}>
                {[
                  { label: '200k', value: 200_000 },
                  { label: '500k', value: 500_000 },
                  { label: '1 triệu', value: 1_000_000 },
                ].map((preset) => (
                  <ChiaNeChip
                    key={preset.value}
                    label={preset.label}
                    active={potAmountVnd === preset.value}
                    onPress={() => {
                      setPotAmountVnd(preset.value);
                      if (potError) setPotError(null);
                    }}
                  />
                ))}
              </View>

              {/* Payment method tabs */}
              <View style={styles.potMemberPicker}>
                <Text style={styles.potFieldLabel}>Hình thức góp tiền</Text>
                <View style={styles.potPresetRow}>
                  <ChiaNeChip
                    label="🏦 Chuyển khoản VietQR"
                    active={potPayMethod === 'BANK_TRANSFER'}
                    onPress={() => setPotPayMethod('BANK_TRANSFER')}
                  />
                  <ChiaNeChip
                    label="💵 Tiền mặt"
                    active={potPayMethod === 'CASH'}
                    onPress={() => setPotPayMethod('CASH')}
                  />
                </View>
              </View>

              {potPayMethod === 'BANK_TRANSFER' ? (
                custodian?.bankPreview.hasRealBank && potVietQrPayload ? (
                  <View style={styles.qrTransferCard}>
                    <VietQrMatrix payload={potVietQrPayload} size={172} />
                    <View style={styles.qrBankInfoBox}>
                      <Text style={styles.qrBankName}>
                        {`${custodian.bankPreview.bankName} · ${custodian.bankPreview.bankAccountNumber}`}
                      </Text>
                      {custodian.bankPreview.bankAccountHolder ? (
                        <Text style={styles.qrHolderName}>
                          {custodian.bankPreview.bankAccountHolder}
                        </Text>
                      ) : null}
                      <Text style={styles.qrMemoText} numberOfLines={1}>
                        {`Nội dung: ${potContributeMemo}`}
                      </Text>
                    </View>
                    <View style={styles.qrCopyRow}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          void copyQrValue(
                            'STK',
                            custodian.bankPreview.bankAccountNumber ?? ''
                          )
                        }
                        style={({ pressed }) => [styles.qrCopyBtn, pressed && styles.pressed]}
                      >
                        <Text style={styles.qrCopyBtnText}>📋 Chép STK</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void copyQrValue('nội dung CK', potContributeMemo)}
                        style={({ pressed }) => [styles.qrCopyBtn, pressed && styles.pressed]}
                      >
                        <Text style={styles.qrCopyBtnText}>📋 Chép nội dung</Text>
                      </Pressable>
                    </View>
                    {copiedQrNotice ? (
                      <Text style={styles.copiedQrToast}>{copiedQrNotice}</Text>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.noBankCallout}>
                    <Text style={styles.noBankCalloutText}>
                      {`Thủ quỹ (${custodian?.displayName ?? 'Trưởng nhóm'}) chưa cài tài khoản ngân hàng — bạn có thể chuyển sang Tiền mặt hoặc nhắc Thủ quỹ cập nhật STK.`}
                    </Text>
                    {custodian?.isMe && group?.myRole !== 'GUEST' ? (
                      <ChiaNeButton
                        label="🏦 Cài tài khoản ngân hàng ngay"
                        variant="secondary"
                        onPress={() => {
                          setPotContributeOpen(false);
                          navigation.navigate('BankAccount');
                        }}
                      />
                    ) : null}
                  </View>
                )
              ) : null}

              <ChiaNeInput
                label="Ghi chú (không bắt buộc)"
                value={potNote}
                onChangeText={setPotNote}
                placeholder="Ví dụ: Góp quỹ đợt 1 đi Đà Lạt"
                maxLength={200}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <ChiaNeButton
                label={
                  potPayMethod === 'BANK_TRANSFER'
                    ? '✅ Đã chuyển & Ghi nhận góp quỹ'
                    : '💵 Ghi nhận góp tiền mặt'
                }
                variant="primary"
                loading={potSubmitting}
                onPress={() => void handleContributePotSubmit()}
              />
              <ChiaNeButton
                label="Đóng"
                variant="quiet"
                disabled={potSubmitting}
                onPress={() => setPotContributeOpen(false)}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Pot Detail & Refund Modal */}
      <Modal
        visible={potDetailOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPotDetailOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPotDetailOpen(false)}
        >
          <Pressable
            style={[styles.modalCard, styles.potDetailModalCard]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>🐷 Chi tiết & Hoàn quỹ</Text>
            {pot ? (
              <ScrollView
                style={styles.potDetailScroll}
                contentContainerStyle={styles.potDetailScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.custodianBox}>
                  <View style={styles.custodianHeaderRow}>
                    <View style={styles.custodianTextCol}>
                      <Text style={styles.custodianEyebrow}>🏦 THỦ QUỸ GIỮ TIỀN</Text>
                      <Text style={styles.custodianName}>
                        {custodian
                          ? `${custodian.displayName}${custodian.isMe ? ' (bạn)' : ''}`
                          : 'Trưởng nhóm'}
                      </Text>
                      {custodian?.bankPreview.hasRealBank ? (
                        <Text style={styles.custodianBankSub}>
                          {`${custodian.bankPreview.bankName} · ${custodian.bankPreview.bankAccountNumber}`}
                        </Text>
                      ) : (
                        <Text style={styles.custodianNoBankSub}>
                          Chưa liên kết tài khoản ngân hàng
                        </Text>
                      )}
                    </View>
                    {group && group.myRole !== 'GUEST' && !group.isArchived ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setCustodianPickerOpen((prev) => !prev)}
                        style={({ pressed }) => [styles.changeCustodianBtn, pressed && styles.pressed]}
                      >
                        <Text style={styles.changeCustodianBtnText}>
                          {custodianPickerOpen ? 'Đóng' : 'Đổi Thủ quỹ'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>

                  {custodianPickerOpen && group ? (
                    <View style={styles.custodianPickerWrap}>
                      <Text style={styles.potFieldLabel}>
                        {updatingCustodian ? 'Đang cập nhật...' : 'Chọn thành viên giữ quỹ:'}
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.potChipRow}
                      >
                        {group.members.map((m) => (
                          <ChiaNeChip
                            key={m.id}
                            label={`${m.displayName}${m.bankPreview?.hasRealBank ? ' 🏦' : ''}`}
                            active={custodian?.memberId === m.id}
                            onPress={() => void handleChangeCustodian(m.id)}
                          />
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>

                <View style={styles.potStatsBar}>
                  <View style={styles.potStatItem}>
                    <Text style={styles.potStatLabel}>Đã góp</Text>
                    <Text style={styles.potStatVal}>
                      {formatVnd(pot.totalContributedVnd)}
                    </Text>
                  </View>
                  <View style={styles.potStatItem}>
                    <Text style={styles.potStatLabel}>Đã chi</Text>
                    <Text style={styles.potStatVal}>
                      {formatVnd(pot.totalSpentFromPotVnd)}
                    </Text>
                  </View>
                  <View style={styles.potStatItem}>
                    <Text style={styles.potStatLabel}>Còn lại</Text>
                    <Text
                      style={[
                        styles.potStatVal,
                        pot.remainingPotVnd < 0 && styles.potNegativeText,
                      ]}
                    >
                      {formatVnd(pot.remainingPotVnd)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.potSectionHeading}>
                  Bảng tính hoàn quỹ thừa từng người
                </Text>
                <View style={styles.potSectionList}>
                  {pot.memberSummaries.map((s) => {
                    const refundColor =
                      s.netRefundVnd > 0
                        ? colors.forest
                        : s.netRefundVnd < 0
                          ? colors.coral
                          : colors.muted;
                    return (
                      <View key={s.memberId} style={styles.potSummaryRow}>
                        <View style={styles.potSummaryLeft}>
                          <Text style={styles.potSummaryName}>
                            {s.displayName}
                            {s.isMe ? ' (bạn)' : ''}
                          </Text>
                          <Text style={styles.potSummarySub}>
                            {`Góp ${formatVnd(s.contributedVnd)} · Tiêu ${formatVnd(
                              s.consumedFromPotVnd
                            )}`}
                          </Text>
                        </View>
                        <View style={styles.potRefundRightCol}>
                          <Text style={[styles.potRefundVal, { color: refundColor }]}>
                            {formatVnd(s.netRefundVnd, { showSign: true })}
                          </Text>
                          {s.netRefundVnd > 0 ? (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => {
                                setCopiedQrNotice(null);
                                setPotDetailOpen(false);
                                setRefundQrTarget(s);
                              }}
                              style={({ pressed }) => [styles.refundQrPill, pressed && styles.pressed]}
                            >
                              <Text style={styles.refundQrPillText}>📲 QR Hoàn tiền</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>

                <Text style={styles.potSectionHeading}>
                  {`Lịch sử góp quỹ (${pot.contributions.length})`}
                </Text>
                {pot.contributions.length === 0 ? (
                  <Text style={styles.potMetaText}>Chưa có lượt góp quỹ nào.</Text>
                ) : (
                  <View style={styles.potSectionList}>
                    {pot.contributions.map((c) => {
                      const d = new Date(c.createdAt);
                      const dateLabel = `${d.getDate().toString().padStart(2, '0')}/${(
                        d.getMonth() + 1
                      )
                        .toString()
                        .padStart(2, '0')}`;
                      return (
                        <View key={c.id} style={styles.potHistoryRow}>
                          <View style={styles.potSummaryLeft}>
                            <Text style={styles.potSummaryName}>{c.memberName}</Text>
                            <Text style={styles.potSummarySub}>
                              {c.note ? `${dateLabel} · ${c.note}` : dateLabel}
                            </Text>
                          </View>
                          <Text style={styles.potContribAmount}>
                            {`+${formatVnd(c.amountVnd)}`}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
            ) : null}

            <View style={styles.modalActions}>
              {group && !group.isArchived ? (
                <ChiaNeButton
                  label="+ Góp thêm vào quỹ"
                  variant="primary"
                  onPress={() => {
                    setPotDetailOpen(false);
                    handleOpenPotContribute();
                  }}
                />
              ) : null}
              <ChiaNeButton
                label="Đóng"
                variant="quiet"
                onPress={() => setPotDetailOpen(false)}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Refund VietQR Modal ("QR Hoàn quỹ thừa") */}
      <Modal
        visible={refundQrTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRefundQrTarget(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setRefundQrTarget(null)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            {refundQrTarget ? (
              <>
                <Text style={styles.modalTitle}>
                  {`📲 Hoàn quỹ thừa cho ${refundQrTarget.displayName}`}
                </Text>
                <Text style={styles.refundHeroAmount}>
                  {formatVnd(refundQrTarget.netRefundVnd)}
                </Text>

                {refundQrTarget.bankPreview?.hasRealBank && refundVietQrPayload ? (
                  <View style={styles.qrTransferCard}>
                    <VietQrMatrix payload={refundVietQrPayload} size={196} />
                    <View style={styles.qrBankInfoBox}>
                      <Text style={styles.qrBankName}>
                        {`${refundQrTarget.bankPreview.bankName} · ${refundQrTarget.bankPreview.bankAccountNumber}`}
                      </Text>
                      {refundQrTarget.bankPreview.bankAccountHolder ? (
                        <Text style={styles.qrHolderName}>
                          {refundQrTarget.bankPreview.bankAccountHolder}
                        </Text>
                      ) : null}
                      <Text style={styles.qrMemoText} numberOfLines={1}>
                        {`Nội dung: ${refundMemo}`}
                      </Text>
                    </View>
                    <View style={styles.qrCopyRow}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          void copyQrValue(
                            'STK',
                            refundQrTarget.bankPreview?.bankAccountNumber ?? ''
                          )
                        }
                        style={({ pressed }) => [styles.qrCopyBtn, pressed && styles.pressed]}
                      >
                        <Text style={styles.qrCopyBtnText}>📋 Chép STK</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void copyQrValue('nội dung CK', refundMemo)}
                        style={({ pressed }) => [styles.qrCopyBtn, pressed && styles.pressed]}
                      >
                        <Text style={styles.qrCopyBtnText}>📋 Chép nội dung</Text>
                      </Pressable>
                    </View>
                    {copiedQrNotice ? (
                      <Text style={styles.copiedQrToast}>{copiedQrNotice}</Text>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.noBankCallout}>
                    <Text style={styles.noBankCalloutText}>
                      {`${refundQrTarget.displayName} chưa cập nhật tài khoản ngân hàng trong mục Tài khoản — bạn có thể hoàn bằng tiền mặt hoặc hỏi STK trực tiếp.`}
                    </Text>
                  </View>
                )}

                <View style={styles.modalActions}>
                  <ChiaNeButton
                    label="Quay lại Chi tiết quỹ"
                    variant="secondary"
                    onPress={() => {
                      setRefundQrTarget(null);
                      setPotDetailOpen(true);
                    }}
                  />
                  <ChiaNeButton
                    label="Đóng"
                    variant="quiet"
                    onPress={() => setRefundQrTarget(null)}
                  />
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <LuckyWheelModal
        visible={luckyWheelOpen}
        members={group?.members ?? []}
        onClose={() => setLuckyWheelOpen(false)}
        onSelectWinner={(winner, mode) => {
          if (!group) return;
          const draftStore = useExpenseDraftStore.getState();
          draftStore.initNew(group.id, group.members, group.myMemberId);
          draftStore.patchDraft({
            paidByMemberId: winner.id,
            ...(mode === 'TREAT_ALL'
              ? { splitMethod: 'EQUAL', participantIds: [winner.id] }
              : {}),
          });
          setLuckyWheelOpen(false);
          navigation.navigate('AddExpense', { groupId: group.id });
        }}
      />

      <TripRecapModal
        visible={recapOpen}
        recap={recapData}
        onClose={() => setRecapOpen(false)}
      />

      <ConfirmDialog
        visible={leaveGuestConfirmOpen}
        title="Thoát chế độ Khách?"
        description="Bạn sẽ rời khỏi phiên xem nhanh nhóm này trên thiết bị. Dữ liệu nhóm vẫn được giữ nguyên."
        confirmLabel="Thoát"
        cancelLabel="Ở lại"
        destructive
        onCancel={() => setLeaveGuestConfirmOpen(false)}
        onConfirm={() => {
          setLeaveGuestConfirmOpen(false);
          void useAuthStore.getState().exitGuestSession();
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconActionBtn: {
    width: 38,
    height: sizes.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  content: {
    gap: 16,
  },
  archivedBanner: {
    backgroundColor: colors.peach,
    borderRadius: radii.iconBadge,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  archivedText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.coral,
  },
  guestBanner: {
    backgroundColor: colors.lavender,
    borderRadius: radii.iconBadge,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  guestTextCol: {
    gap: 2,
  },
  guestTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.purple,
  },
  guestSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.purple,
  },
  guestActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  guestPrimaryBtn: {
    backgroundColor: colors.forest,
    borderRadius: radii.chip,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  guestPrimaryBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.lime,
  },
  guestQuitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.chip,
    borderWidth: 1,
    borderColor: colors.purple,
  },
  guestQuitBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.purple,
  },
  summaryCard: {
    minHeight: 154,
    backgroundColor: colors.lavender,
    borderRadius: radii.heroCard,
    padding: 18,
    justifyContent: 'space-between',
  },
  summaryMeta: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.purple,
  },
  summaryBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  summaryAmountCol: {
    flex: 1,
    gap: 4,
  },
  summaryLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.purple,
  },
  summaryAmount: {
    fontFamily: fonts.bold,
    fontSize: 29,
    lineHeight: 40,
    color: colors.forest,
  },
  addFab: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tabChip: {
    flex: 1,
  },
  tabBody: {
    gap: 16,
  },
  bucketWrap: {
    gap: 10,
  },
  bucketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bucketTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  bucketCount: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
  },
  expenseList: {
    gap: 10,
  },
  quoteFooter: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
  },
  emptyWrap: {
    gap: 16,
  },
  emptyHeroCard: {
    backgroundColor: colors.lavender,
    borderRadius: radii.heroCard,
    padding: 24,
    alignItems: 'center',
    gap: 14,
    minHeight: 340,
    justifyContent: 'center',
  },
  emptyIconBox: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyHeading: {
    fontFamily: fonts.bold,
    fontSize: 24,
    lineHeight: 34,
    color: colors.purple,
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.purple,
    textAlign: 'center',
  },
  emptyTabsRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  emptyActions: {
    gap: 12,
  },
  emptyFooter: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
  },
  membersCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  balanceRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  memberInfoCol: {
    flex: 1,
    gap: 2,
  },
  memberName: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.ink,
  },
  memberRole: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
  },
  memberRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  balanceValue: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
  },
  memberActionsStack: {
    gap: 12,
  },
  quickAddMemberBtn: {
    height: 48,
    borderRadius: radii.button,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  quickAddMemberText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.forest,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(23, 62, 50, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.white,
    borderRadius: radii.heroCard,
    padding: 22,
    gap: 12,
  },
  modalTitle: {
    ...typography.title,
    color: colors.ink,
  },
  modalDesc: {
    ...typography.body,
    color: colors.muted,
  },
  modalActions: {
    gap: 10,
    marginTop: 4,
  },
  socialFunRow: {
    flexDirection: 'row',
    gap: 10,
  },
  funPillBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.button,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  funPillLavender: {
    backgroundColor: colors.lavender,
  },
  funPillLavenderText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.purple,
  },
  funPillForest: {
    backgroundColor: colors.forest,
  },
  funPillForestText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.lime,
  },
  potCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  potEmptyCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  potHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  potTitleCol: {
    flex: 1,
    gap: 3,
  },
  potTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
  },
  potRemainingText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.forest,
  },
  potNegativeText: {
    color: colors.coral,
  },
  potAddBtn: {
    backgroundColor: colors.lime,
    borderRadius: radii.chip,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  potAddBtnText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.forest,
  },
  potProgressTrack: {
    height: 8,
    backgroundColor: colors.paper,
    borderRadius: 4,
    overflow: 'hidden',
  },
  potProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  potFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  potMetaText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
  },
  potDetailLink: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.purple,
  },
  potGuestBox: {
    backgroundColor: colors.paper,
    borderRadius: 12,
    padding: 12,
  },
  potGuestText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.ink,
  },
  potMemberPicker: {
    gap: 6,
  },
  potFieldLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.ink,
  },
  potChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  potPresetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  potDetailModalCard: {
    maxHeight: '85%',
  },
  potDetailScroll: {
    maxHeight: 380,
  },
  potDetailScrollContent: {
    gap: 12,
  },
  potStatsBar: {
    flexDirection: 'row',
    backgroundColor: colors.paper,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  potStatItem: {
    flex: 1,
    gap: 2,
  },
  potStatLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
  },
  potStatVal: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.forest,
  },
  potSectionHeading: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.ink,
    marginTop: 2,
  },
  potSectionList: {
    backgroundColor: colors.paper,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  potSummaryRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  potHistoryRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  potSummaryLeft: {
    flex: 1,
    gap: 1,
  },
  potSummaryName: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
  },
  potSummarySub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
  },
  potRefundVal: {
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  potContribAmount: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.forest,
  },
  potCustodianLine: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.purple,
  },
  potContributeModalCard: {
    maxHeight: '90%',
  },
  potContributeScroll: {
    maxHeight: 450,
  },
  potContributeScrollContent: {
    gap: 12,
    paddingBottom: 4,
  },
  custodianBox: {
    backgroundColor: colors.lavender,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  custodianHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  custodianTextCol: {
    flex: 1,
    gap: 2,
  },
  custodianEyebrow: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.purple,
    letterSpacing: 0.4,
  },
  custodianName: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
  },
  custodianBankSub: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.forest,
  },
  custodianNoBankSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.coral,
  },
  changeCustodianBtn: {
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  changeCustodianBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.purple,
  },
  custodianPickerWrap: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(110, 85, 165, 0.2)',
    paddingTop: 8,
  },
  qrTransferCard: {
    backgroundColor: colors.paper,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  qrBankInfoBox: {
    width: '100%',
    alignItems: 'center',
    gap: 2,
  },
  qrBankName: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.ink,
    textAlign: 'center',
  },
  qrHolderName: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.forest,
    textAlign: 'center',
  },
  qrMemoText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
  },
  qrCopyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  qrCopyBtn: {
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  qrCopyBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.forest,
  },
  copiedQrToast: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.forest,
  },
  noBankCallout: {
    backgroundColor: colors.peach,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  noBankCalloutText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.coral,
  },
  potRefundRightCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  refundQrPill: {
    backgroundColor: colors.lime,
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  refundQrPillText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.forest,
  },
  refundHeroAmount: {
    fontFamily: fonts.extraBold,
    fontSize: 28,
    color: colors.forest,
    textAlign: 'center',
  },
});
