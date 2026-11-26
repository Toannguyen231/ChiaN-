import { CollectPaymentButton } from '../../components/CollectPaymentButton';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
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
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  buildVietQrPayload,
  formatVnd,
  parseVndInput,
  type ExpenseDto,
  type GroupBalancesDto,
  type GroupPotDto,
  type GroupPotMemberSummaryDto,
  type SettlementDto,
} from '@chiane/shared';
import IconArrow from '../../../assets/figma/icon-arrow.svg';
import IconChevron from '../../../assets/figma/icon-chevron.svg';
import IconPlusLight from '../../../assets/figma/icon-plus-light.svg';
import {
  AnimatedNumber,
  AnimatedSegmentedControl,
  AppHeader,
  AvatarBadge,
  BottomSheetModal,
  CardListSkeleton,
  ChiaNeButton,
  ChiaNeChip,
  ChiaNeInput,
  ConfirmDialog,
  ExpenseRow,
  FadeSlideIn,
  GROUP_CATEGORY_META,
  IconGear,
  IconUserPlus,
  InfoCard,
  LuckyWheelModal,
  ScalePressable,
  ScreenContainer,
  showToast,
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
import {
  colors,
  fonts,
  radii,
  shadows,
  sizes,
  tabularNums,
} from '../../theme/tokens';
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
  const { groupId, initialTab, justCreated } = route.params;
  const cachedGroup = useGroupsStore((s) => s.groupDetailsById[groupId]);
  const fetchGroupDetail = useGroupsStore((s) => s.fetchGroupDetail);

  const [group, setGroup] = useState(cachedGroup ?? null);
  const [balances, setBalances] = useState<GroupBalancesDto | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>(initialTab ?? 'EXPENSES');
  const [inviteBannerDismissed, setInviteBannerDismissed] = useState(false);
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
  const [exportingExcel, setExportingExcel] = useState(false);
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
  const [refundQrTarget, setRefundQrTarget] = useState<GroupPotMemberSummaryDto | null>(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const loadGroup = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else if (!useGroupsStore.getState().groupDetailsById[groupId]) {
        setLoading(true);
      }
      setErrorText(null);
      try {
        const [detail, potRes, balancesRes] = await Promise.all([
          fetchGroupDetail(groupId),
          potApi.getPot(groupId).catch(() => null),
          settlementsApi.getBalances(groupId).catch(() => null),
        ]);
        setGroup(detail);
        if (potRes) {
          setPot(potRes);
        }
        if (balancesRes) {
          setBalances(balancesRes);
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

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const filteredExpenses = useMemo(() => {
    const expenses = group?.expenses ?? [];
    if (expenses.length < 2) return expenses;
    const term = query.trim().toLocaleLowerCase('vi');
    return expenses.filter(exp => (category === 'ALL' || exp.category === category) &&
      [exp.title, exp.paidByName].some(value => value.toLocaleLowerCase('vi').includes(term)));
  }, [group, query, category]);

  const groupedExpenses = useMemo(() => {
    if (!group) return [] as Array<{ label: string; items: ExpenseDto[] }>;
    const buckets = new Map<string, ExpenseDto[]>();
    for (const exp of filteredExpenses) {
      const label = formatMonthBucket(exp.expenseDate);
      const list = buckets.get(label) ?? [];
      list.push(exp);
      buckets.set(label, list);
    }
    return Array.from(buckets.entries()).map(([label, items]) => ({ label, items }));
  }, [group, filteredExpenses]);

  const handleCopyInvite = async () => {
    if (!group) return;
    await Clipboard.setStringAsync(group.inviteLink);
    showToast('Đã sao chép liên kết mời!');
  };

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
      showToast(`Đã thêm ${trimmed} vào nhóm!`);
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

  const handleExportExcel = async () => {
    if (!group || exportingExcel) return;
    setExportingExcel(true);
    try {
      const res = await groupsApi.exportExcelBase64(group.id);
      if (Platform.OS === 'web') {
        const binaryString = globalThis.atob(res.base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i += 1) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const WebBlob = Blob as unknown as new (
          parts: Uint8Array[],
          options?: { type?: string }
        ) => Blob;
        const blob = new WebBlob([bytes], { type: res.mimeType });
        const url = URL.createObjectURL(blob);
        const webGlobal = globalThis as unknown as {
          document?: {
            createElement: (tag: string) => {
              href: string;
              download: string;
              click: () => void;
            };
            body?: {
              appendChild: (el: unknown) => void;
              removeChild: (el: unknown) => void;
            };
          };
        };
        if (webGlobal.document?.body) {
          const link = webGlobal.document.createElement('a');
          link.href = url;
          link.download = res.filename;
          webGlobal.document.body.appendChild(link);
          link.click();
          webGlobal.document.body.removeChild(link);
        }
        URL.revokeObjectURL(url);
        showToast('Đã tải xuống tệp Excel!');
        return;
      }

      const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!baseDir) {
        Alert.alert('Lỗi', 'Không tìm thấy thư mục lưu tệp tạm trên thiết bị.');
        return;
      }
      const fileUri = `${baseDir}${res.filename}`;
      await FileSystem.writeAsStringAsync(fileUri, res.base64, {
        encoding: 'base64',
      });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Đã tạo tệp Excel', `Tệp đã lưu tại: ${fileUri}`);
        return;
      }
      await Sharing.shareAsync(fileUri, {
        mimeType: res.mimeType,
        dialogTitle: 'Xuất báo cáo Excel ChiaNè',
        UTI: 'org.openxmlformats.spreadsheetml.sheet',
      });
    } catch (err) {
      Alert.alert(
        'Không thể xuất Excel',
        err instanceof ApiClientError
          ? err.message
          : 'Vui lòng thử lại khi có kết nối mạng.'
      );
    } finally {
      setExportingExcel(false);
    }
  };

  const handleOpenPotContribute = () => {
    if (!group) return;
    setPotMemberId(group.myMemberId);
    setPotAmountVnd(500_000);
    setPotNote('');
    setPotError(null);
    setPotPayMethod('BANK_TRANSFER');
    setCustodianPickerOpen(false);
    setPotContributeOpen(true);
  };

  const copyQrValue = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value);
    showToast(`Đã sao chép ${label}!`);
  };

  const handleChangeCustodian = async (memberId: string) => {
    if (!group || updatingCustodian) return;
    setUpdatingCustodian(true);
    setPotError(null);
    try {
      const nextPot = await potApi.setCustodian(group.id, memberId);
      setPot(nextPot);
      setCustodianPickerOpen(false);
      showToast('Đã đổi Thủ quỹ giữ tiền!');
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
      showToast('Đã ghi nhận tiền góp quỹ!');
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

  const myBalancePill = group
    ? group.myBalanceVnd > 0
      ? {
          text: `Bạn được nhận ${formatVnd(group.myBalanceVnd)}`,
          bg: colors.lime,
          fg: colors.forest,
        }
      : group.myBalanceVnd < 0
        ? {
            text: `Bạn cần trả ${formatVnd(Math.abs(group.myBalanceVnd))}`,
            bg: colors.peach,
            fg: colors.coral,
          }
        : {
            text: 'Đã cân bằng ✓',
            bg: colors.white,
            fg: colors.forest,
          }
    : null;

  const showUtilityBar =
    group &&
    ((group.members.length >= 2 && !group.isArchived) ||
      (!hasPotActivity && !group.isArchived) ||
      group.expenses.length > 0);

  const utilityBar =
    group && showUtilityBar ? (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.utilityBarRow}
      >
        {group.members.length >= 2 && !group.isArchived ? (
          <ScalePressable
            accessibilityRole="button"
            onPress={() => setLuckyWheelOpen(true)}
            scaleTo={0.95}
            style={[styles.utilPill, styles.utilPillLavender]}
          >
            <Text style={styles.utilPillLavenderText}>🎡 Quay người bao</Text>
          </ScalePressable>
        ) : null}
        {!hasPotActivity && !group.isArchived ? (
          <ScalePressable
            accessibilityRole="button"
            onPress={handleOpenPotContribute}
            scaleTo={0.95}
            style={[styles.utilPill, styles.utilPillSage]}
          >
            <Text style={styles.utilPillForestText}>🐷 Mở quỹ chung</Text>
          </ScalePressable>
        ) : null}
        {group.expenses.length > 0 ? (
          <>
            <ScalePressable
              accessibilityRole="button"
              onPress={() => void handleOpenRecap()}
              scaleTo={0.95}
              style={[styles.utilPill, styles.utilPillForest]}
            >
              <Text style={styles.utilPillLimeText}>🏆 Tổng kết</Text>
            </ScalePressable>
            <ScalePressable
              accessibilityRole="button"
              disabled={exportingExcel}
              onPress={() => void handleExportExcel()}
              scaleTo={0.95}
              style={[styles.utilPill, styles.utilPillLime]}
            >
              <Text style={styles.utilPillForestText}>
                {exportingExcel ? '⏳ Đang xuất...' : '📊 Xuất Excel'}
              </Text>
            </ScalePressable>
          </>
        ) : null}
      </ScrollView>
    ) : null;

  const potSummaryCard =
    group && hasPotActivity && pot ? (
      <View style={styles.potCard}>
        <View style={styles.potHeaderRow}>
          <View style={styles.potTitleCol}>
            <Text style={styles.potTitle}>🐷 Quỹ chung nhóm</Text>
            <Text
              style={[
                styles.potRemainingText,
                tabularNums,
                pot.remainingPotVnd < 0 && styles.potNegativeText,
              ]}
            >
              {`Còn lại: ${formatVnd(pot.remainingPotVnd)} / ${formatVnd(
                pot.totalContributedVnd
              )}`}
            </Text>
          </View>
          {!group.isArchived ? (
            <ScalePressable
              accessibilityRole="button"
              onPress={handleOpenPotContribute}
              scaleTo={0.95}
              style={styles.potAddBtn}
            >
              <Text style={styles.potAddBtnText}>+ Góp quỹ</Text>
            </ScalePressable>
          ) : null}
        </View>
        {custodian ? (
          <Text style={styles.potCustodianLine} numberOfLines={1}>
            {`🏦 Thủ quỹ: ${custodian.displayName}${
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
          <Text style={[styles.potMetaText, tabularNums]}>
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
    ) : null;

  const renderBalancesTab = () => {
    if (!group) return null;
    const pendingList = balances?.pendingSettlements ?? [];
    const suggestedList = balances?.suggestedTransfers ?? [];
    const memberBalances = balances?.memberBalances;
    const isAllBalanced = balances ? suggestedList.length === 0 : false;

    return (
      <View style={styles.tabBody}>
        {balances ? (
          <FadeSlideIn index={0}>
            <InfoCard tone="lime" style={styles.balanceHeroCard}>
              <Text style={styles.balanceHeroTitle}>
                {isAllBalanced
                  ? 'Cả nhóm đã cân bằng! 🎉'
                  : 'Ít chuyển khoản, thêm thảnh thơi.'}
              </Text>
              <Text style={styles.balanceHeroSub}>
                {isAllBalanced
                  ? 'Mọi khoản chi trong nhóm đều đã được thanh toán sòng phẳng.'
                  : `Gộp gọn thành ${suggestedList.length} lượt chuyển. Số tiền mỗi người không thay đổi.`}
              </Text>
            </InfoCard>
          </FadeSlideIn>
        ) : null}

        {pendingList.length > 0 ? (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionHeading}>Đang chờ xác nhận</Text>
            <View style={styles.transferList}>
              {pendingList.map((stl) => (
                <ScalePressable
                  key={stl.id}
                  onPress={() =>
                    navigation.navigate(
                      stl.canConfirm
                        ? 'ConfirmPaymentReceived'
                        : 'WaitingConfirmation',
                      { settlementId: stl.id }
                    )
                  }
                  scaleTo={0.98}
                  style={styles.pendingRow}
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
                    <Text style={[styles.transferAmount, tabularNums]}>
                      {formatVnd(stl.amountVnd)}
                    </Text>
                    <IconChevron width={16} height={16} />
                  </View>
                </ScalePressable>
              ))}
            </View>
          </View>
        ) : null}

        {suggestedList.length > 0 ? (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionHeading}>Chuyển thế này là gọn nhất</Text>
            <View style={styles.transferList}>
              {suggestedList.map((transfer, idx) => {
                const canRemind = transfer.isToMe && group.myRole !== 'GUEST';
                const canPay = transfer.isFromMe && !group.isArchived;
                const canCollect =
                  transfer.isToMe &&
                  !group.isArchived &&
                  (Boolean(transfer.fromIsPlaceholder) || group.myRole === 'ADMIN');
                return (
                  <FadeSlideIn
                    key={`${transfer.fromMemberId}-${transfer.toMemberId}`}
                    index={idx}
                  >
                    <View style={styles.transferCard}>
                      <View style={styles.transferTopRow}>
                        <View style={styles.transferPeople}>
                          <AvatarBadge name={transfer.fromName} size={28} />
                          <Text style={styles.transferPerson} numberOfLines={1}>
                            {transfer.isFromMe ? 'Bạn' : transfer.fromName}
                          </Text>
                          <IconArrow width={16} height={16} />
                          <AvatarBadge name={transfer.toName} size={28} />
                          <Text style={styles.transferPerson} numberOfLines={1}>
                            {transfer.isToMe ? 'Bạn' : transfer.toName}
                          </Text>
                        </View>
                        <Text style={[styles.transferAmount, tabularNums]}>
                          {formatVnd(transfer.amountVnd)}
                        </Text>
                      </View>

                      {canPay || canRemind || canCollect ? (
                        <View style={styles.transferActionRow}>
                          {canPay ? (
                            <ScalePressable
                              accessibilityRole="button"
                              onPress={() =>
                                navigation.navigate('Payment', {
                                  groupId: group.id,
                                  toMemberId: transfer.toMemberId,
                                  amountVnd: transfer.amountVnd,
                                })
                              }
                              scaleTo={0.96}
                              style={styles.payNowBtn}
                            >
                              <Text style={styles.payNowBtnText}>
                                Trả ngay qua VietQR / Tiền mặt ›
                              </Text>
                            </ScalePressable>
                          ) : (
                            <>
                              {canRemind ? (
                                <ScalePressable
                                  accessibilityRole="button"
                                  onPress={() =>
                                    navigation.navigate('FriendlyReminder', {
                                      groupId: group.id,
                                      recipientMemberId: transfer.fromMemberId,
                                      creditorName: transfer.toName,
                                      amountVnd: transfer.amountVnd,
                                    })
                                  }
                                  scaleTo={0.96}
                                  style={styles.remindBtn}
                                >
                                  <Text style={styles.remindBtnText} numberOfLines={1}>
                                    {canCollect
                                      ? 'Nhắc nhẹ ›'
                                      : `Gửi nhắc nhẹ cho ${transfer.fromName} ›`}
                                  </Text>
                                </ScalePressable>
                              ) : null}
                              {canCollect ? (
                                <CollectPaymentButton
                                  groupId={groupId}
                                  transfer={transfer}
                                  refresh={() => loadGroup(true)}
                                  style={styles.collectBtnFlex}
                                />
                              ) : null}
                            </>
                          )}
                        </View>
                      ) : null}
                    </View>
                  </FadeSlideIn>
                );
              })}
            </View>
          </View>
        ) : null}

        <Text style={styles.eyebrow}>SỐ DƯ TỪNG THÀNH VIÊN</Text>
        <View style={styles.membersCard}>
          {(memberBalances
            ? memberBalances.map((m) => ({
                id: m.memberId,
                displayName: m.displayName,
                isMe: m.isMe,
                netBalanceVnd: m.netBalanceVnd,
              }))
            : group.members.map((m) => ({
                id: m.id,
                displayName: m.displayName,
                isMe: m.isMe,
                netBalanceVnd: m.netBalanceVnd,
              }))
          ).map((member, index) => {
            const balColor =
              member.netBalanceVnd < 0
                ? colors.coral
                : member.netBalanceVnd > 0
                  ? colors.forest
                  : colors.muted;
            return (
              <React.Fragment key={member.id}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <ScalePressable
                  onPress={() =>
                    navigation.navigate('MemberDetails', {
                      groupId: group.id,
                      memberId: member.id,
                    })
                  }
                  scaleTo={0.99}
                  style={styles.balanceRow}
                >
                  <View style={styles.memberAvatarName}>
                    <AvatarBadge
                      name={member.displayName}
                      size={32}
                      highlight={member.isMe}
                    />
                    <Text style={styles.memberName}>
                      {member.displayName}
                      {member.isMe ? ' (bạn)' : ''}
                    </Text>
                  </View>
                  <Text style={[styles.balanceValue, tabularNums, { color: balColor }]}>
                    {formatVnd(member.netBalanceVnd, { showSign: true })}
                  </Text>
                </ScalePressable>
              </React.Fragment>
            );
          })}
        </View>

        <View style={styles.balanceFooterLinks}>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => navigation.navigate('PaymentHistory', { groupId: group.id })}
          >
            <Text style={styles.secondaryLink}>Lịch sử thanh toán</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => navigation.navigate('GroupBalances', { groupId: group.id })}
          >
            <Text style={styles.secondaryLink}>Xem toàn màn công nợ ›</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderMembersTab = () => {
    if (!group) return null;
    return (
      <View style={styles.tabBody}>
        <View style={styles.membersCard}>
          {group.members.map((member, index) => (
            <React.Fragment key={member.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <ScalePressable
                onPress={() =>
                  navigation.navigate('MemberDetails', {
                    groupId: group.id,
                    memberId: member.id,
                  })
                }
                scaleTo={0.99}
                style={styles.balanceRow}
              >
                <View style={styles.memberAvatarName}>
                  <AvatarBadge
                    name={member.displayName}
                    size={36}
                    highlight={member.isMe}
                  />
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
                </View>
                <View style={styles.memberRightCol}>
                  <Text
                    style={[
                      styles.balanceValue,
                      tabularNums,
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
              </ScalePressable>
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
              <ScalePressable
                onPress={() => {
                  setAddMemberError(null);
                  setAddMemberOpen(true);
                }}
                scaleTo={0.98}
                style={styles.quickAddMemberBtn}
              >
                <IconUserPlus width={18} height={18} color={colors.forest} />
                <Text style={styles.quickAddMemberText}>
                  Thêm thành viên thủ công
                </Text>
              </ScalePressable>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

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
            group && group.myRole !== 'GUEST' ? (
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
            ) : undefined
          }
        />
      }
    >
      {loading && !group ? (
        <View style={styles.loadingWrap}>
          <CardListSkeleton count={3} cardHeight={104} />
        </View>
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

          {justCreated && !inviteBannerDismissed && group.myRole !== 'GUEST' ? (
            <FadeSlideIn index={0}>
              <View style={styles.justCreatedBanner}>
                <View style={styles.justCreatedTop}>
                  <Text style={styles.justCreatedTitle}>
                    🎉 Nhóm sẵn sàng! Mời bạn bè vào cùng chia nhé
                  </Text>
                  <Pressable
                    hitSlop={8}
                    onPress={() => setInviteBannerDismissed(true)}
                  >
                    <Text style={styles.justCreatedDismiss}>✕</Text>
                  </Pressable>
                </View>
                <View style={styles.justCreatedActions}>
                  <ScalePressable
                    onPress={() => void handleCopyInvite()}
                    scaleTo={0.96}
                    style={styles.justCreatedCopyBtn}
                  >
                    <Text style={styles.justCreatedCopyText}>📋 Sao chép link</Text>
                  </ScalePressable>
                  <ScalePressable
                    onPress={() =>
                      navigation.navigate('InviteFriends', { groupId: group.id })
                    }
                    scaleTo={0.96}
                    style={styles.justCreatedShareBtn}
                  >
                    <Text style={styles.justCreatedShareText}>Mời qua Zalo ›</Text>
                  </ScalePressable>
                </View>
              </View>
            </FadeSlideIn>
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

          {group.expenses.length === 0 ? (
            <>
              <AnimatedSegmentedControl<DetailTab>
                options={[
                  { key: 'EXPENSES', label: 'Khoản chi' },
                  {
                    key: 'BALANCES',
                    label: 'Số dư',
                    badgeCount: balances?.pendingSettlements.length ?? 0,
                  },
                  { key: 'MEMBERS', label: `Thành viên (${group.memberCount})` },
                ]}
                value={activeTab}
                onChange={setActiveTab}
              />

              {activeTab === 'EXPENSES' ? (
                <View style={styles.emptyWrap}>
                  <View style={styles.emptyHeroCard}>
                    <View style={styles.emptyIconBox}>
                      <CategoryIcon width={46} height={46} />
                    </View>
                    <Text style={styles.emptyHeading}>
                      {`${group.name},\nchi tiêu cũng chung.`}
                    </Text>
                    <Text style={styles.emptySub}>
                      Chưa có khoản chi nào. Ghi khoản chi đầu tiên để cả hội cùng theo dõi rõ ràng nhé.
                    </Text>
                  </View>

                  {utilityBar}
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
              ) : activeTab === 'BALANCES' ? (
                renderBalancesTab()
              ) : (
                renderMembersTab()
              )}
            </>
          ) : (
            <>
              <FadeSlideIn index={0}>
                <View style={styles.summaryCard}>
                  <View style={styles.summaryTopRow}>
                    <Text style={styles.summaryMeta}>
                      {`${group.memberCount} thành viên · ${group.expenseCount} khoản chi`}
                    </Text>
                    {myBalancePill ? (
                      <View
                        style={[
                          styles.myBalPill,
                          { backgroundColor: myBalancePill.bg },
                        ]}
                      >
                        <Text
                          style={[
                            styles.myBalPillText,
                            tabularNums,
                            { color: myBalancePill.fg },
                          ]}
                        >
                          {myBalancePill.text}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.summaryBottomRow}>
                    <View style={styles.summaryAmountCol}>
                      <Text style={styles.summaryLabel}>Cả nhóm đã chi</Text>
                      <AnimatedNumber
                        value={group.totalSpentVnd}
                        style={styles.summaryAmount}
                      />
                    </View>
                    {!group.isArchived ? (
                      <ScalePressable
                        accessibilityRole="button"
                        accessibilityLabel="Thêm khoản chi nhanh"
                        onPress={() =>
                          navigation.navigate('AddExpense', { groupId: group.id })
                        }
                        scaleTo={0.92}
                        style={styles.addFab}
                      >
                        <IconPlusLight width={24} height={24} />
                      </ScalePressable>
                    ) : null}
                  </View>
                </View>
              </FadeSlideIn>

              {utilityBar}
              {potSummaryCard}

              <AnimatedSegmentedControl<DetailTab>
                options={[
                  { key: 'EXPENSES', label: 'Khoản chi' },
                  {
                    key: 'BALANCES',
                    label: 'Số dư',
                    badgeCount: balances?.pendingSettlements.length ?? 0,
                  },
                  { key: 'MEMBERS', label: `Thành viên (${group.memberCount})` },
                ]}
                value={activeTab}
                onChange={setActiveTab}
              />

              {activeTab === 'EXPENSES' ? (
                <View style={styles.tabBody}>
                  {group.expenses.length >= 2 ? (
                    <View style={styles.expenseFilterWrap}>
                      <ChiaNeInput
                        value={query}
                        onChangeText={setQuery}
                        accessibilityLabel="Tìm khoản chi"
                        placeholder="Tìm theo tên khoản chi hoặc người trả"
                      />
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.expenseFilterChipsRow}
                      >
                        {Object.entries({
                          ALL: 'Tất cả',
                          FOOD: 'Ăn uống',
                          STAY: 'Lưu trú',
                          TRANSPORT: 'Di chuyển',
                          COFFEE: 'Cà phê',
                          OTHER: 'Khác',
                        }).map(([key, label]) => (
                          <ChiaNeChip
                            key={key}
                            label={label}
                            active={category === key}
                            onPress={() => setCategory(key)}
                          />
                        ))}
                      </ScrollView>
                      <View style={styles.expenseFilterSummaryRow}>
                        <Text style={[styles.bucketTitle, tabularNums]}>
                          {filteredExpenses.length} khoản ·{' '}
                          {formatVnd(filteredExpenses.reduce((sum, exp) => sum + exp.amountVnd, 0))}
                        </Text>
                        {query.trim() !== '' || category !== 'ALL' ? (
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                              setQuery('');
                              setCategory('ALL');
                            }}
                            hitSlop={8}
                          >
                            <Text style={styles.clearFilterText}>Xóa bộ lọc</Text>
                          </Pressable>
                        ) : null}
                      </View>
                      {filteredExpenses.length === 0 ? (
                        <View style={styles.emptyFilterCard}>
                          <Text style={styles.emptyFilterText}>
                            Chưa có khoản chi nào khớp bộ lọc.
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  {groupedExpenses.map((bucket, bucketIdx) => (
                    <View key={bucket.label} style={styles.bucketWrap}>
                      <View style={styles.bucketHeader}>
                        <Text style={styles.bucketTitle}>{bucket.label}</Text>
                        <Text style={styles.bucketCount}>
                          {bucket.items.length} khoản
                        </Text>
                      </View>
                      <View style={styles.expenseList}>
                        {bucket.items.map((exp, idx) => (
                          <FadeSlideIn
                            key={exp.id}
                            index={bucketIdx * 2 + idx}
                          >
                            <ExpenseRow
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
                          </FadeSlideIn>
                        ))}
                      </View>
                    </View>
                  ))}
                  <Text style={styles.quoteFooter}>
                    Ghi đủ hôm nay, khỏi quên ngày mai.
                  </Text>
                </View>
              ) : null}

              {activeTab === 'BALANCES' ? renderBalancesTab() : null}
              {activeTab === 'MEMBERS' ? renderMembersTab() : null}
            </>
          )}
        </View>
      ) : null}

      {/* Add Member BottomSheet */}
      <BottomSheetModal
        visible={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        dismissable={!addingMember}
        title="Thêm thành viên"
        subtitle="Nhập tên thành viên (và SĐT nếu muốn liên kết tài khoản ChiaNè của bạn đó)."
        footer={
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
        }
      >
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
      </BottomSheetModal>

      {/* Contribute Pot BottomSheet */}
      <BottomSheetModal
        visible={potContributeOpen}
        onClose={() => setPotContributeOpen(false)}
        dismissable={!potSubmitting}
        title="🐷 Góp quỹ chung nhóm"
        scrollable
        footer={
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
        }
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

        <View style={styles.potMemberPicker}>
          <Text style={styles.potFieldLabel}>Hình thức góp tiền</Text>
          <AnimatedSegmentedControl<'BANK_TRANSFER' | 'CASH'>
            options={[
              { key: 'BANK_TRANSFER', label: 'Chuyển khoản VietQR' },
              { key: 'CASH', label: 'Tiền mặt' },
            ]}
            value={potPayMethod}
            onChange={setPotPayMethod}
          />
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
                <ScalePressable
                  accessibilityRole="button"
                  onPress={() =>
                    void copyQrValue(
                      'STK',
                      custodian.bankPreview.bankAccountNumber ?? ''
                    )
                  }
                  scaleTo={0.95}
                  style={styles.qrCopyBtn}
                >
                  <Text style={styles.qrCopyBtnText}>📋 Chép STK</Text>
                </ScalePressable>
                <ScalePressable
                  accessibilityRole="button"
                  onPress={() => void copyQrValue('nội dung CK', potContributeMemo)}
                  scaleTo={0.95}
                  style={styles.qrCopyBtn}
                >
                  <Text style={styles.qrCopyBtnText}>📋 Chép nội dung</Text>
                </ScalePressable>
              </View>
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
      </BottomSheetModal>

      {/* Pot Detail & Refund BottomSheet */}
      <BottomSheetModal
        visible={potDetailOpen}
        onClose={() => setPotDetailOpen(false)}
        title="🐷 Chi tiết & Hoàn quỹ"
        scrollable
        footer={
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
        }
      >
        {pot ? (
          <>
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
                <Text style={[styles.potStatVal, tabularNums]}>
                  {formatVnd(pot.totalContributedVnd)}
                </Text>
              </View>
              <View style={styles.potStatItem}>
                <Text style={styles.potStatLabel}>Đã chi</Text>
                <Text style={[styles.potStatVal, tabularNums]}>
                  {formatVnd(pot.totalSpentFromPotVnd)}
                </Text>
              </View>
              <View style={styles.potStatItem}>
                <Text style={styles.potStatLabel}>Còn lại</Text>
                <Text
                  style={[
                    styles.potStatVal,
                    tabularNums,
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
                      <Text style={[styles.potRefundVal, tabularNums, { color: refundColor }]}>
                        {formatVnd(s.netRefundVnd, { showSign: true })}
                      </Text>
                      {s.netRefundVnd > 0 ? (
                        <ScalePressable
                          accessibilityRole="button"
                          onPress={() => {
                            setPotDetailOpen(false);
                            setRefundQrTarget(s);
                          }}
                          scaleTo={0.95}
                          style={styles.refundQrPill}
                        >
                          <Text style={styles.refundQrPillText}>📲 QR Hoàn tiền</Text>
                        </ScalePressable>
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
                      <Text style={[styles.potContribAmount, tabularNums]}>
                        {`+${formatVnd(c.amountVnd)}`}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        ) : null}
      </BottomSheetModal>

      {/* Refund VietQR BottomSheet */}
      <BottomSheetModal
        visible={refundQrTarget !== null}
        onClose={() => setRefundQrTarget(null)}
        title={
          refundQrTarget
            ? `📲 Hoàn quỹ thừa cho ${refundQrTarget.displayName}`
            : undefined
        }
        footer={
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
        }
      >
        {refundQrTarget ? (
          <>
            <Text style={[styles.refundHeroAmount, tabularNums]}>
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
                  <ScalePressable
                    accessibilityRole="button"
                    onPress={() =>
                      void copyQrValue(
                        'STK',
                        refundQrTarget.bankPreview?.bankAccountNumber ?? ''
                      )
                    }
                    scaleTo={0.95}
                    style={styles.qrCopyBtn}
                  >
                    <Text style={styles.qrCopyBtnText}>📋 Chép STK</Text>
                  </ScalePressable>
                  <ScalePressable
                    accessibilityRole="button"
                    onPress={() => void copyQrValue('nội dung CK', refundMemo)}
                    scaleTo={0.95}
                    style={styles.qrCopyBtn}
                  >
                    <Text style={styles.qrCopyBtnText}>📋 Chép nội dung</Text>
                  </ScalePressable>
                </View>
              </View>
            ) : (
              <View style={styles.noBankCallout}>
                <Text style={styles.noBankCalloutText}>
                  {`${refundQrTarget.displayName} chưa cập nhật tài khoản ngân hàng trong mục Tài khoản — bạn có thể hoàn bằng tiền mặt hoặc hỏi STK trực tiếp.`}
                </Text>
              </View>
            )}
          </>
        ) : null}
      </BottomSheetModal>

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
  iconActionBtn: {
    width: 38,
    height: sizes.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingWrap: {
    marginTop: 12,
  },
  pressed: {
    opacity: 0.85,
  },
  content: {
    gap: 14,
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
  justCreatedBanner: {
    backgroundColor: colors.lime,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: 'rgba(23, 62, 50, 0.16)',
    padding: 14,
    gap: 10,
    ...shadows.card,
  },
  justCreatedTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  justCreatedTitle: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.forest,
  },
  justCreatedDismiss: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.forest,
    paddingHorizontal: 4,
  },
  justCreatedActions: {
    flexDirection: 'row',
    gap: 8,
  },
  justCreatedCopyBtn: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  justCreatedCopyText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.forest,
  },
  justCreatedShareBtn: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  justCreatedShareText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.lime,
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
    minHeight: 136,
    backgroundColor: colors.lavender,
    borderRadius: radii.heroCard,
    padding: 18,
    justifyContent: 'space-between',
    ...shadows.card,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryMeta: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.purple,
    flexShrink: 1,
  },
  myBalPill: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  myBalPillText: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
  },
  summaryBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  summaryAmountCol: {
    flex: 1,
    gap: 2,
  },
  summaryLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.purple,
  },
  summaryAmount: {
    fontFamily: fonts.bold,
    fontSize: 29,
    lineHeight: 38,
    color: colors.forest,
  },
  addFab: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  utilityBarRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  utilPill: {
    height: 36,
    borderRadius: radii.pill,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  utilPillLavender: {
    backgroundColor: colors.lavender,
  },
  utilPillSage: {
    backgroundColor: colors.sage,
  },
  utilPillForest: {
    backgroundColor: colors.forest,
  },
  utilPillLime: {
    backgroundColor: colors.lime,
  },
  utilPillLavenderText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.purple,
  },
  utilPillForestText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.forest,
  },
  utilPillLimeText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.lime,
  },
  tabBody: {
    gap: 14,
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
    textAlign: 'center',
  },
  emptyWrap: {
    gap: 14,
  },
  emptyHeroCard: {
    backgroundColor: colors.lavender,
    borderRadius: radii.heroCard,
    padding: 22,
    alignItems: 'center',
    gap: 12,
    minHeight: 240,
    justifyContent: 'center',
  },
  emptyIconBox: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyHeading: {
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 31,
    color: colors.purple,
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.purple,
    textAlign: 'center',
  },
  emptyActions: {
    gap: 10,
  },
  emptyFooter: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 2,
  },
  balanceHeroCard: {
    borderRadius: radii.featureCard,
    gap: 6,
  },
  balanceHeroTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
  },
  balanceHeroSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.ink,
  },
  sectionBlock: {
    gap: 10,
  },
  sectionHeading: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.ink,
  },
  transferList: {
    gap: 10,
  },
  pendingRow: {
    minHeight: 62,
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
  transferCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 10,
    ...shadows.card,
  },
  transferTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  transferPeople: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
  },
  transferPerson: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
    flexShrink: 1,
  },
  transferAmount: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.forest,
  },
  transferActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  collectBtnFlex: {
    flex: 1,
  },
  payNowBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  payNowBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.lime,
  },
  remindBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  remindBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.purple,
  },
  eyebrow: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
    marginBottom: -4,
  },
  balanceFooterLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  secondaryLink: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.forest,
  },
  membersCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: 4,
    ...shadows.card,
  },
  balanceRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  memberAvatarName: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
  modalActions: {
    gap: 10,
  },
  potCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.card,
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
  expenseFilterWrap: {
    gap: 10,
  },
  expenseFilterChipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  expenseFilterSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  clearFilterText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.purple,
  },
  emptyFilterCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 20,
    alignItems: 'center',
  },
  emptyFilterText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
  },
});
