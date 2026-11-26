import { inferReceiptMimeType, uploadReceiptIfNeeded } from '../../services/receiptUploads';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import {
  calculateItemizedSplit,
  formatVnd,
  parseVndInput,
  validateExactSplit,
  type ExpenseCategory,
  type ReceiptItemDto,
} from '@chiane/shared';
import IconCheck from '../../../assets/figma/icon-check.svg';
import IconChevron from '../../../assets/figma/icon-chevron.svg';
import IconReceipt from '../../../assets/figma/icon-receipt.svg';
import {
  AppHeader,
  AvatarBadge,
  BottomSheetModal,
  ChiaNeButton,
  ChiaNeChip,
  ChiaNeInput,
  LuckyWheelModal,
  ScalePressable,
  ScreenContainer,
  showToast,
  StateView,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError, receiptImageSource } from '../../services/apiClient';
import { expensesApi } from '../../services/expensesApi';
import { ocrApi } from '../../services/ocrApi';
import { potApi } from '../../services/potApi';
import { useExpenseDraftStore } from '../../store/expenseDraftStore';
import { useGroupsStore } from '../../store/groupsStore';
import { useOfflineQueueStore } from '../../store/offlineQueueStore';
import {
  colors,
  fonts,
  radii,
  shadows,
  sizes,
  tabularNums,
  typography,
} from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'AddExpense'>;

const EXPENSE_CATEGORIES: Array<{ key: ExpenseCategory; label: string }> = [
  { key: 'FOOD', label: 'Ăn uống' },
  { key: 'STAY', label: 'Lưu trú' },
  { key: 'TRANSPORT', label: 'Di chuyển' },
  { key: 'COFFEE', label: 'Cà phê' },
  { key: 'OTHER', label: 'Khác' },
];

function formatDateVi(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return 'Hôm nay';
  }
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function parseDateVi(input: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input.trim());
  if (!match) return null;
  const day = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const year = Number.parseInt(match[3]!, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) {
    return null;
  }
  const d = new Date(year, month - 1, day, 12, 0, 0);
  if (d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }
  return d.toISOString();
}

export function AddExpenseScreen({ navigation, route }: Props) {
  const { groupId, expenseId, autoScanReceipt } = route.params;
  const isEdit = Boolean(expenseId);

  const cachedGroup = useGroupsStore((s) => s.groupDetailsById[groupId]);
  const fetchGroupDetail = useGroupsStore((s) => s.fetchGroupDetail);
  const enqueueExpense = useOfflineQueueStore((s) => s.enqueueExpense);

  const draft = useExpenseDraftStore();

  const [loading, setLoading] = useState(!cachedGroup || isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasPotActivity, setHasPotActivity] = useState(false);

  const [payerModalOpen, setPayerModalOpen] = useState(false);
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [dateText, setDateText] = useState(formatDateVi(new Date().toISOString()));
  const [dateError, setDateError] = useState<string | null>(null);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [receiptInput, setReceiptInput] = useState('');

  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [scanningReceipt, setScanningReceipt] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [ocrFailed, setOcrFailed] = useState(false);
  const [receiptImageUri, setReceiptImageUri] = useState<string>(draft.receiptImageUrl || '');
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const [itemizedOverflowed, setItemizedOverflowed] = useState(false);
  const [luckyWheelOpen, setLuckyWheelOpen] = useState(false);

  const autoScanTriggeredRef = useRef(false);
  const pickingImageRef = useRef(false);

  const initialize = useCallback(async () => {
    setLoadError(null);
    try {
      const [groupDetail, potRes] = await Promise.all([
        useGroupsStore.getState().groupDetailsById[groupId]
          ? Promise.resolve(useGroupsStore.getState().groupDetailsById[groupId]!)
          : fetchGroupDetail(groupId),
        potApi.getPot(groupId).catch(() => null),
      ]);

      setHasPotActivity(
        Boolean(potRes) &&
          ((potRes?.totalContributedVnd ?? 0) > 0 ||
            (potRes?.totalSpentFromPotVnd ?? 0) > 0)
      );

      if (expenseId) {
        const res = await expensesApi.getExpense(expenseId);
        draft.initFromExpense(res.expense, groupDetail.members);
        setReceiptImageUri(res.expense.receiptImageUrl ?? '');
      } else if (draft.groupId !== groupId || draft.expenseId !== null) {
        draft.initNew(groupId, groupDetail.members, groupDetail.myMemberId);
        setReceiptImageUri('');
      }
    } catch (err) {
      setLoadError(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể tải thông tin nhóm để ghi khoản chi.'
      );
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId, fetchGroupDetail, groupId]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (
      autoScanReceipt &&
      !loading &&
      !loadError &&
      !autoScanTriggeredRef.current
    ) {
      autoScanTriggeredRef.current = true;
      setPhotoPickerOpen(true);
    }
  }, [autoScanReceipt, loadError, loading]);

  const handlePickImage = async (fromCamera: boolean) => {
    if (pickingImageRef.current || scanningReceipt) {
      return;
    }
    pickingImageRef.current = true;
    Keyboard.dismiss();
    setPhotoPickerOpen(false);
    setScanNotice(null);
    setOcrFailed(false);

    try {
      if (fromCamera && Platform.OS !== 'web') {
        let permission = await ImagePicker.getCameraPermissionsAsync();
        if (!permission.granted) {
          permission = await ImagePicker.requestCameraPermissionsAsync();
        }
        if (!permission.granted) {
          setScanNotice(
            'Chưa có quyền Máy ảnh. Hãy bật quyền trong Cài đặt hoặc chọn ảnh từ thư viện nhé.'
          );
          if (permission.canAskAgain === false) {
            Alert.alert(
              'Cần quyền Máy ảnh',
              'Bật quyền Máy ảnh trong Cài đặt thiết bị để chụp hóa đơn nhé.',
              [
                { text: 'Để sau', style: 'cancel' },
                { text: 'Mở Cài đặt', onPress: () => void Linking.openSettings() },
              ]
            );
          }
          return;
        }
      }

      const pickerFn = fromCamera
        ? ImagePicker.launchCameraAsync
        : ImagePicker.launchImageLibraryAsync;

      let result: ImagePicker.ImagePickerResult;
      try {
        result = await pickerFn({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.65,
          base64: true,
        });
      } catch {
        setScanNotice(
          fromCamera
            ? 'Không mở được máy ảnh trên thiết bị này — bạn hãy bấm "Chọn ảnh từ máy" nhé.'
            : 'Không mở được thư viện ảnh. Bạn thử lại nhé.'
        );
        return;
      }

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];
      const imageUri = asset.uri;
      const cleanBase64 = asset.base64?.replace(/\s+/g, '') ?? '';

      if (!cleanBase64) {
        setScanNotice('Chưa đọc được dữ liệu ảnh. Bạn thử chọn lại ảnh khác nhé.');
        return;
      }
      if (cleanBase64.length > 4 * Math.ceil(5 * 1024 * 1024 / 3)) {
        setScanNotice('Ảnh hóa đơn lớn hơn 5 MB. Bạn chọn ảnh nhỏ hơn nhé.');
        return;
      }
      const mimeType = inferReceiptMimeType(cleanBase64, asset.mimeType);
      setReceiptImageUri(imageUri);
      draft.patchDraft({ receiptImageUrl: `data:${mimeType};base64,${cleanBase64}`, scannedItems: [] });
      setScanningReceipt(true);
      try {
        const scan = await ocrApi.scanReceipt({
          imageBase64: cleanBase64,
          mimeType,
        });

        const normalizedItems: ReceiptItemDto[] = (scan.items ?? []).map((it) => ({
          ...it,
          assignedMemberIds: [],
        }));

        draft.patchDraft({
          ...(scan.totalVnd > 0 ? { amountVnd: scan.totalVnd } : {}),
          ...(scan.detectedMerchant && !draft.title.trim()
            ? { title: scan.detectedMerchant }
            : {}),
          ...(scan.detectedCategory ? { category: scan.detectedCategory } : {}),
          ...(normalizedItems.length > 0 ? { scannedItems: normalizedItems } : {}),
        });
        setItemizedOverflowed(false);
        setOcrFailed(false);

        if (scan.notice) {
          setScanNotice(scan.notice);
        } else {
          showToast('Đã quét xong hóa đơn!');
        }
      } catch (ocrErr) {
        setOcrFailed(true);
        setScanNotice(
          ocrErr instanceof ApiClientError
            ? ocrErr.message
            : 'AI chưa đọc được hóa đơn, bạn vẫn có thể nhập tay số tiền.'
        );
      } finally {
        setScanningReceipt(false);
      }
    } catch {
      setScanNotice('Lỗi khi mở máy ảnh hoặc thư viện ảnh.');
    } finally {
      pickingImageRef.current = false;
    }
  };

  const group = cachedGroup ?? useGroupsStore.getState().groupDetailsById[groupId];
  const members = useMemo(() => group?.members ?? [], [group?.members]);

  const hasCustomItemAssignments = useMemo(() => {
    const count = members.length;
    if (count === 0) return false;
    return draft.scannedItems.some((item) => {
      const assignedCount = new Set(item.assignedMemberIds ?? []).size;
      return assignedCount > 0 && assignedCount < count;
    });
  }, [draft.scannedItems, members.length]);

  const applyItemizedDraft = useCallback(
    (nextItems: ReceiptItemDto[], amountVnd: number) => {
      const memberIds = members.map((m) => m.id);
      if (memberIds.length === 0) {
        draft.patchDraft({ scannedItems: nextItems });
        return;
      }

      const customActive = nextItems.some((item) => {
        const assignedCount = new Set(item.assignedMemberIds ?? []).size;
        return assignedCount > 0 && assignedCount < memberIds.length;
      });

      if (!customActive) {
        setItemizedOverflowed(false);
        draft.patchDraft({
          scannedItems: nextItems,
          splitMethod: 'EQUAL',
          participantIds: memberIds,
        });
        return;
      }

      if (amountVnd <= 0) {
        setItemizedOverflowed(false);
        draft.patchDraft({ scannedItems: nextItems });
        return;
      }

      const result = calculateItemizedSplit(amountVnd, memberIds, nextItems);
      const exactMap: Record<string, number> = {};
      for (const s of result.shares) {
        exactMap[s.memberId] = s.amountVnd;
      }
      setItemizedOverflowed(result.overflowed);
      draft.patchDraft({
        scannedItems: nextItems,
        splitMethod: 'EXACT',
        participantIds: memberIds,
        exactAmountsByMember: exactMap,
      });
    },
    [draft, members]
  );

  const toggleMemberForActiveItem = (memberId: string) => {
    if (activeItemIndex === null) return;
    const item = draft.scannedItems[activeItemIndex];
    if (!item) return;

    const currentSet = new Set(item.assignedMemberIds ?? []);
    if (currentSet.has(memberId)) {
      currentSet.delete(memberId);
    } else {
      currentSet.add(memberId);
    }

    const nextAssigned =
      currentSet.size >= members.length ? [] : Array.from(currentSet);
    const nextItems = draft.scannedItems.map((it, idx) =>
      idx === activeItemIndex ? { ...it, assignedMemberIds: nextAssigned } : it
    );
    applyItemizedDraft(nextItems, draft.amountVnd);
  };

  const resetActiveItemToAll = () => {
    if (activeItemIndex === null) return;
    const nextItems = draft.scannedItems.map((it, idx) =>
      idx === activeItemIndex ? { ...it, assignedMemberIds: [] } : it
    );
    applyItemizedDraft(nextItems, draft.amountVnd);
  };

  const toggleInlineEqualMember = (memberId: string) => {
    const exists = draft.participantIds.includes(memberId);
    if (exists) {
      if (draft.participantIds.length <= 1) {
        showToast({
          message: 'Cần giữ ít nhất 1 người để chia khoản chi.',
          tone: 'warning',
        });
        return;
      }
      draft.patchDraft({
        participantIds: draft.participantIds.filter((id) => id !== memberId),
      });
    } else {
      draft.patchDraft({
        participantIds: [...draft.participantIds, memberId],
      });
    }
  };

  const payerName =
    members.find((m) => m.id === draft.paidByMemberId)?.displayName ?? 'Chọn người trả';

  const splitMethodLabel =
    hasCustomItemAssignments
      ? 'Theo từng món'
      : draft.splitMethod === 'EQUAL'
        ? 'Chia đều'
        : draft.splitMethod === 'EXACT'
          ? 'Số tiền'
          : 'Phần trăm';

  const handleAmountChange = (raw: string) => {
    const nextAmount = parseVndInput(raw);
    if (hasCustomItemAssignments && nextAmount > 0 && members.length > 0) {
      const result = calculateItemizedSplit(
        nextAmount,
        members.map((m) => m.id),
        draft.scannedItems
      );
      const exactMap: Record<string, number> = {};
      for (const s of result.shares) {
        exactMap[s.memberId] = s.amountVnd;
      }
      setItemizedOverflowed(result.overflowed);
      draft.patchDraft({
        amountVnd: nextAmount,
        splitMethod: 'EXACT',
        participantIds: members.map((m) => m.id),
        exactAmountsByMember: exactMap,
      });
    } else {
      draft.patchDraft({ amountVnd: nextAmount });
    }
    if (submitError) setSubmitError(null);
  };

  const formattedAmountInput =
    draft.amountVnd > 0 ? formatVnd(draft.amountVnd, { includeSymbol: false }) : '';

  const handleOpenDateModal = () => {
    setDateText(formatDateVi(draft.expenseDateIso));
    setDateError(null);
    setDateModalOpen(true);
  };

  const handleApplyDateText = () => {
    const iso = parseDateVi(dateText);
    if (!iso) {
      setDateError('Ngày chưa đúng định dạng DD/MM/YYYY');
      return;
    }
    draft.patchDraft({ expenseDateIso: iso });
    setDateModalOpen(false);
  };

  const handleOpenNoteModal = () => {
    setNoteInput(draft.note);
    setReceiptInput(
      draft.receiptImageUrl.startsWith('data:image/') ? '' : draft.receiptImageUrl
    );
    setNoteModalOpen(true);
  };

  const handleSave = async () => {
    if (!group) return;
    if (draft.amountVnd <= 0) {
      setSubmitError('Vui lòng nhập số tiền lớn hơn 0 ₫.');
      return;
    }
    const cleanTitle = draft.title.trim();
    if (!cleanTitle) {
      setSubmitError('Vui lòng nhập mô tả khoản chi.');
      return;
    }
    if (draft.participantIds.length === 0) {
      setSubmitError('Cần chọn ít nhất 1 người tham gia.');
      return;
    }

    let splitsPayload: Array<{
      memberId: string;
      amountVnd?: number;
      percentageBps?: number;
    }>;

    if (draft.splitMethod === 'EQUAL') {
      splitsPayload = draft.participantIds.map((memberId) => ({ memberId }));
    } else if (draft.splitMethod === 'EXACT') {
      const entries = draft.participantIds.map((memberId) => ({
        memberId,
        amountVnd: draft.exactAmountsByMember[memberId] ?? 0,
      }));
      const validation = validateExactSplit(draft.amountVnd, entries);
      if (!validation.valid) {
        setSubmitError(
          'Tổng các phần chia tùy chỉnh chưa khớp số tiền khoản chi. Hãy bấm "Chia cho" để điều chỉnh.'
        );
        return;
      }
      splitsPayload = entries;
    } else {
      const entries = draft.participantIds.map((memberId) => ({
        memberId,
        percentageBps: draft.percentageBpsByMember[memberId] ?? 0,
      }));
      const sumBps = entries.reduce((acc, e) => acc + e.percentageBps, 0);
      if (sumBps !== 10000) {
        setSubmitError('Tổng tỷ lệ phần trăm phải đúng bằng 100%.');
        return;
      }
      splitsPayload = entries;
    }

    setSubmitting(true);
    setSubmitError(null);

    const basePayload = {
      title: cleanTitle,
      amountVnd: draft.amountVnd,
      category: draft.category,
      splitMethod: draft.splitMethod,
      paidByMemberId: draft.paidByMemberId,
      expenseDate: draft.expenseDateIso,
      isPaidFromPot: draft.isPaidFromPot,
      ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
      ...(draft.receiptImageUrl.trim()
        ? { receiptImageUrl: draft.receiptImageUrl.trim() }
        : {}),
      splits: splitsPayload,
    };

    try {
      if (isEdit && expenseId) {
        await expensesApi.updateExpense(expenseId, {
          ...basePayload,
          note: draft.note.trim() ? draft.note.trim() : null,
          receiptImageUrl: await uploadReceiptIfNeeded(draft.receiptImageUrl.trim()) || null,
        });
        await fetchGroupDetail(groupId);
        draft.clearDraft();
        showToast('Đã cập nhật khoản chi!');
        navigation.goBack();
      } else {
        const clientMutationId = `chiane_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 10)}`;
        try {
          const receiptUrl = await uploadReceiptIfNeeded(basePayload.receiptImageUrl);
          if (receiptUrl) {
            basePayload.receiptImageUrl = receiptUrl;
            draft.patchDraft({ receiptImageUrl: receiptUrl });
          }
          await expensesApi.createExpense(groupId, {
            ...basePayload,
            clientMutationId,
          });
          await fetchGroupDetail(groupId);
          draft.clearDraft();
          showToast('Đã lưu khoản chi!');
          navigation.goBack();
        } catch (err) {
          if (err instanceof ApiClientError && err.code === 'NETWORK_ERROR') {
            await enqueueExpense({
              groupId,
              groupName: group.name,
              payload: basePayload,
              clientMutationId,
            });
            draft.clearDraft();
            navigation.replace('OfflineSaved', { groupId });
            return;
          }
          throw err;
        }
      }
    } catch (err) {
      setSubmitError(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể lưu khoản chi. Vui lòng thử lại.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const showScanResultCard =
    scanningReceipt ||
    Boolean(scanNotice) ||
    Boolean(receiptImageUri) ||
    draft.scannedItems.length > 0;

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      header={
        <AppHeader
          title={isEdit ? 'Chỉnh sửa khoản chi' : 'Thêm khoản chi'}
          onBack={() => {
            draft.clearDraft();
            navigation.goBack();
          }}
        />
      }
      footer={
        group && !loading ? (
          <ChiaNeButton
            label={isEdit ? 'Lưu thay đổi' : 'Lưu khoản chi'}
            variant="primary"
            loading={submitting}
            disabled={scanningReceipt || draft.amountVnd <= 0 || !draft.title.trim()}
            onPress={() => void handleSave()}
          />
        ) : undefined
      }
    >
      {loading && !group ? (
        <StateView kind="loading" title="Đang chuẩn bị biểu mẫu..." />
      ) : loadError && !group ? (
        <StateView
          kind="error"
          title="Không tải được nhóm"
          description={loadError}
          actionLabel="Thử lại"
          onAction={() => void initialize()}
        />
      ) : group ? (
        <View style={styles.content}>
          {/* 1) Top Bar: Group Pill + Compact AI Scan Pill */}
          <View style={styles.topRow}>
            <View style={styles.groupBadge}>
              <Text style={styles.groupBadgeText} numberOfLines={1}>
                {group.name}
              </Text>
            </View>
            <ScalePressable
              accessibilityRole="button"
              onPress={() => {
                Keyboard.dismiss();
                setPhotoPickerOpen((prev) => !prev);
              }}
              disabled={scanningReceipt}
              scaleTo={0.95}
              style={styles.ocrCompactPill}
            >
              <Text style={styles.ocrCompactPillText}>
                {scanningReceipt
                  ? '⏳ Đang quét...'
                  : receiptImageUri
                    ? '📷 Quét lại bill'
                    : '✨ Quét bill AI'}
              </Text>
            </ScalePressable>
          </View>

          {photoPickerOpen && !scanningReceipt ? (
            <View style={styles.inlinePickerCard}>
              <View style={styles.inlinePickerHeader}>
                <View style={styles.inlinePickerTitleCol}>
                  <Text style={styles.inlinePickerTitle}>✨ Quét hóa đơn AI</Text>
                  <Text style={styles.inlinePickerSub}>
                    Chụp ảnh mới hoặc chọn ảnh có sẵn, AI sẽ tự đọc số tiền và tách món.
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setPhotoPickerOpen(false)}
                >
                  <Text style={styles.inlinePickerClose}>Đóng</Text>
                </Pressable>
              </View>
              <View style={styles.inlinePickerBtnRow}>
                <ScalePressable
                  accessibilityRole="button"
                  onPress={() => void handlePickImage(true)}
                  scaleTo={0.96}
                  style={styles.inlineCameraBtn}
                >
                  <Text style={styles.inlineCameraBtnText}>📷 Chụp ảnh mới</Text>
                </ScalePressable>
                <ScalePressable
                  accessibilityRole="button"
                  onPress={() => void handlePickImage(false)}
                  scaleTo={0.96}
                  style={styles.inlineGalleryBtn}
                >
                  <Text style={styles.inlineGalleryBtnText}>🖼️ Chọn ảnh từ máy</Text>
                </ScalePressable>
              </View>
            </View>
          ) : null}

          {/* 2) Hero Amount Input */}
          <View style={styles.amountCard}>
            <Text style={styles.amountEyebrow}>SỐ TIỀN</Text>
            <View style={styles.amountRow}>
              <TextInput
                value={formattedAmountInput}
                onChangeText={handleAmountChange}
                placeholder="0"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                style={[styles.amountInput, tabularNums]}
                maxLength={14}
              />
              <Text style={styles.currencySymbol}>₫</Text>
            </View>
          </View>

          {/* 3) Description + Category */}
          <ChiaNeInput
            label="Chi cho việc gì?"
            value={draft.title}
            onChangeText={(text) => {
              draft.patchDraft({ title: text });
              if (submitError) setSubmitError(null);
            }}
            placeholder="Bữa tối cùng hội"
            maxLength={120}
          />

          <View>
            <Text style={styles.fieldLabel}>Danh mục</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryChipsRow}
            >
              {EXPENSE_CATEGORIES.map((cat) => (
                <ChiaNeChip
                  key={cat.key}
                  label={cat.label}
                  active={draft.category === cat.key}
                  onPress={() => draft.patchDraft({ category: cat.key })}
                />
              ))}
            </ScrollView>
          </View>

          {/* 4) Collapsible AI Receipt Result Card (only shown when scanning or scanned) */}
          {showScanResultCard ? (
            <View style={styles.ocrCard}>
              {scanningReceipt ? (
                <View style={styles.scanningBox}>
                  <Text style={styles.scanningText}>
                    ⏳ AI đang đọc các món và tính tổng tiền hóa đơn...
                  </Text>
                </View>
              ) : null}

              {scanNotice ? (
                <View
                  style={[
                    styles.ocrNoticeBox,
                    (scanNotice.startsWith('✨') || scanNotice.startsWith('🎉')) &&
                      styles.ocrNoticeSuccessBox,
                  ]}
                >
                  <Text
                    style={[
                      styles.ocrNoticeText,
                      (scanNotice.startsWith('✨') || scanNotice.startsWith('🎉')) &&
                        styles.ocrNoticeSuccessText,
                    ]}
                  >
                    {scanNotice}
                  </Text>
                </View>
              ) : null}

              {__DEV__ && ocrFailed && !scanningReceipt ? (
                <ChiaNeButton
                  variant="quiet"
                  label="🧪 Điền thử hóa đơn mẫu (DEV)"
                  onPress={() => {
                    draft.patchDraft({
                      title: draft.title.trim() || 'Hóa đơn ăn uống mẫu',
                      amountVnd: 550000,
                      category: 'FOOD',
                      scannedItems: [
                        { name: 'Lẩu gà lá é', priceVnd: 380000, quantity: 1, assignedMemberIds: [] },
                        { name: 'Bia Sài Gòn (4 lon)', priceVnd: 120000, quantity: 4, assignedMemberIds: [] },
                        { name: 'Bánh tráng & khăn lạnh', priceVnd: 50000, quantity: 1, assignedMemberIds: [] },
                      ],
                    });
                    setOcrFailed(false);
                    setScanNotice('🧪 Đang dùng dữ liệu hóa đơn mẫu (DEV).');
                  }}
                />
              ) : null}

              {receiptImageUri ? (
                <View style={styles.receiptPreviewRow}>
                  <Image
                    source={{ uri: receiptImageSource(receiptImageUri) }}
                    style={styles.receiptPreviewThumb}
                    resizeMode="cover"
                  />
                  <View style={styles.receiptPreviewMeta}>
                    <Text style={styles.receiptAttachedText}>Đã đính kèm ảnh hóa đơn</Text>
                    <Pressable
                      onPress={() => {
                        setReceiptImageUri('');
                        setItemizedOverflowed(false);
                        setOcrFailed(false);
                        setScanNotice(null);
                        draft.patchDraft({
                          receiptImageUrl: '',
                          scannedItems: [],
                        });
                      }}
                    >
                      <Text style={styles.removeReceiptText}>Gỡ ảnh</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {draft.scannedItems.length > 0 ? (
                <View style={styles.scannedItemsWrap}>
                  <View style={styles.scannedHeaderRow}>
                    <Text style={styles.scannedItemsHeading}>
                      {`Món nhận diện (${draft.scannedItems.length} món) · Chạm để chọn người`}
                    </Text>
                  </View>
                  <View style={styles.scannedItemsList}>
                    {draft.scannedItems.map((item, idx) => {
                      const assignedIds = (item.assignedMemberIds ?? []).filter((id) =>
                        members.some((m) => m.id === id)
                      );
                      const isCustom =
                        assignedIds.length > 0 && assignedIds.length < members.length;
                      const assigneeNames = assignedIds
                        .map((id) => members.find((m) => m.id === id)?.displayName ?? '')
                        .filter(Boolean);
                      const chipLabel = isCustom
                        ? assigneeNames.length <= 2
                          ? `👤 ${assigneeNames.join(', ')}`
                          : `👤 ${assignedIds.length} người · ${assigneeNames.slice(0, 2).join(', ')} +${assigneeNames.length - 2}`
                        : '🍽️ Cả bàn';

                      return (
                        <ScalePressable
                          key={`${item.name}_${idx}`}
                          accessibilityRole="button"
                          onPress={() => setActiveItemIndex(idx)}
                          scaleTo={0.98}
                          style={[
                            styles.scannedItemCard,
                            isCustom && styles.scannedItemCardAssigned,
                          ]}
                        >
                          <View style={styles.scannedItemTopRow}>
                            <Text style={styles.scannedItemName} numberOfLines={1}>
                              {item.quantity && item.quantity > 1 ? `${item.quantity}x ` : ''}
                              {item.name}
                            </Text>
                            <Text style={[styles.scannedItemPrice, tabularNums]}>
                              {formatVnd(item.priceVnd)}
                            </Text>
                          </View>
                          <View style={styles.scannedItemBottomRow}>
                            <View
                              style={[
                                styles.itemAssigneeChip,
                                isCustom && styles.itemAssigneeChipActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.itemAssigneeChipText,
                                  isCustom && styles.itemAssigneeChipTextActive,
                                ]}
                                numberOfLines={1}
                              >
                                {chipLabel}
                              </Text>
                            </View>
                            <Text style={styles.itemEditHint}>Chọn người ›</Text>
                          </View>
                        </ScalePressable>
                      );
                    })}
                  </View>

                  {hasCustomItemAssignments && draft.amountVnd > 0 ? (
                    <View style={styles.itemizedSummaryCard}>
                      <Text style={styles.itemizedSummaryTitle}>
                        🍺 Tạm tính chia theo món từng người:
                      </Text>
                      <View style={styles.itemizedSummaryGrid}>
                        {members.map((m) => (
                          <View key={m.id} style={styles.itemizedMemberChip}>
                            <Text style={styles.itemizedMemberName} numberOfLines={1}>
                              {m.displayName}
                            </Text>
                            <Text style={[styles.itemizedMemberAmount, tabularNums]}>
                              {formatVnd(draft.exactAmountsByMember[m.id] ?? 0)}
                            </Text>
                          </View>
                        ))}
                      </View>
                      {itemizedOverflowed ? (
                        <Text style={styles.itemizedOverflowNote}>
                          Tổng món riêng vượt tổng bill (do giảm giá/voucher) — đã tự chia lại đúng tỷ lệ.
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* 5) Settings Card + Inline Quick Member Toggle */}
          <View style={styles.settingsCard}>
            <View style={styles.payerSettingWrap}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPayerModalOpen(true)}
                style={({ pressed }) => [
                  styles.settingRowFlex,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.settingLabel}>Người trả</Text>
                <View style={styles.settingRight}>
                  <Text style={styles.settingValue} numberOfLines={1}>
                    {draft.isPaidFromPot ? `Quỹ chung (${payerName} ghi)` : payerName}
                  </Text>
                  <IconChevron width={16} height={16} />
                </View>
              </Pressable>
              {!draft.isPaidFromPot && members.length >= 2 ? (
                <ScalePressable
                  accessibilityRole="button"
                  onPress={() => setLuckyWheelOpen(true)}
                  hitSlop={4}
                  scaleTo={0.94}
                  style={styles.wheelPillBtn}
                >
                  <Text style={styles.wheelPillText}>🎡 Quay</Text>
                </ScalePressable>
              ) : null}
            </View>

            <View style={styles.divider} />

            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('SplitMethod', { groupId })}
              style={({ pressed }) => [
                styles.settingRow,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.settingLabel}>Chia cho</Text>
              <View style={styles.settingRight}>
                <Text style={styles.settingValue}>
                  {`${draft.participantIds.length} người · ${splitMethodLabel}`}
                </Text>
                <IconChevron width={16} height={16} />
              </View>
            </Pressable>

            {draft.splitMethod === 'EQUAL' &&
            !hasCustomItemAssignments &&
            members.length > 0 ? (
              <View style={styles.quickSplitStripWrap}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.quickSplitStrip}
                >
                  {members.map((m) => {
                    const selected = draft.participantIds.includes(m.id);
                    return (
                      <ScalePressable
                        key={m.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        onPress={() => toggleInlineEqualMember(m.id)}
                        scaleTo={0.95}
                        style={[
                          styles.memberSplitChip,
                          selected && styles.memberSplitChipOn,
                        ]}
                      >
                        <AvatarBadge
                          name={m.displayName}
                          size={22}
                          highlight={selected}
                        />
                        <Text
                          style={[
                            styles.memberSplitName,
                            selected && styles.memberSplitNameOn,
                          ]}
                          numberOfLines={1}
                        >
                          {m.displayName}
                        </Text>
                      </ScalePressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.divider} />

            <Pressable
              accessibilityRole="button"
              onPress={handleOpenDateModal}
              style={({ pressed }) => [
                styles.settingRow,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.settingLabel}>Ngày chi</Text>
              <View style={styles.settingRight}>
                <Text style={styles.settingValue}>
                  {formatDateVi(draft.expenseDateIso)}
                </Text>
                <IconChevron width={16} height={16} />
              </View>
            </Pressable>

            {hasPotActivity || draft.isPaidFromPot ? (
              <>
                <View style={styles.divider} />
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: draft.isPaidFromPot }}
                  onPress={() =>
                    draft.patchDraft({ isPaidFromPot: !draft.isPaidFromPot })
                  }
                  style={({ pressed }) => [
                    styles.potToggleRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.potToggleTextCol}>
                    <Text style={styles.potToggleTitle}>🐷 Trừ từ quỹ chung nhóm</Text>
                    <Text style={styles.potToggleSub}>
                      Trừ vào số dư quỹ, không tạo nợ cá nhân
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.checkbox,
                      draft.isPaidFromPot ? styles.checkboxOn : styles.checkboxOff,
                    ]}
                  >
                    {draft.isPaidFromPot ? <IconCheck width={15} height={15} /> : null}
                  </View>
                </Pressable>
              </>
            ) : null}
          </View>

          {/* 6) Optional Note Bar */}
          <ScalePressable
            accessibilityRole="button"
            onPress={handleOpenNoteModal}
            scaleTo={0.98}
            style={styles.noteBar}
          >
            <IconReceipt width={20} height={20} />
            <Text style={styles.noteBarText} numberOfLines={1}>
              {draft.note.trim()
                ? `Ghi chú: ${draft.note.trim()}`
                : 'Thêm ghi chú (tùy chọn)'}
            </Text>
            <IconChevron width={16} height={16} />
          </ScalePressable>

          {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        </View>
      ) : null}

      {/* Payer Picker BottomSheet */}
      <BottomSheetModal
        visible={payerModalOpen}
        onClose={() => setPayerModalOpen(false)}
        title="Ai đã trả khoản này?"
        scrollable
        footer={
          <ChiaNeButton
            label="Đóng"
            variant="quiet"
            onPress={() => setPayerModalOpen(false)}
          />
        }
      >
        <View style={styles.modalList}>
          {members.map((member) => {
            const selected = member.id === draft.paidByMemberId;
            return (
              <ScalePressable
                key={member.id}
                onPress={() => {
                  draft.patchDraft({ paidByMemberId: member.id });
                  setPayerModalOpen(false);
                }}
                scaleTo={0.98}
                style={[styles.payerRow, selected && styles.payerRowSelected]}
              >
                <View style={styles.memberAvatarRow}>
                  <AvatarBadge
                    name={member.displayName}
                    size={32}
                    highlight={selected}
                  />
                  <Text style={styles.payerName}>
                    {member.displayName}
                    {member.isMe ? ' (bạn)' : ''}
                  </Text>
                </View>
                {selected ? (
                  <View style={styles.checkBadge}>
                    <IconCheck width={14} height={14} />
                  </View>
                ) : null}
              </ScalePressable>
            );
          })}
        </View>
      </BottomSheetModal>

      {/* Date Picker BottomSheet */}
      <BottomSheetModal
        visible={dateModalOpen}
        onClose={() => setDateModalOpen(false)}
        title="Chọn ngày chi"
        footer={
          <View style={styles.modalActions}>
            <ChiaNeButton
              label="Áp dụng ngày"
              variant="primary"
              onPress={handleApplyDateText}
            />
            <ChiaNeButton
              label="Hủy"
              variant="quiet"
              onPress={() => setDateModalOpen(false)}
            />
          </View>
        }
      >
        <View style={styles.quickDatesRow}>
          <ChiaNeChip
            label="Hôm nay"
            onPress={() => {
              const now = new Date();
              draft.patchDraft({ expenseDateIso: now.toISOString() });
              setDateModalOpen(false);
            }}
          />
          <ChiaNeChip
            label="Hôm qua"
            onPress={() => {
              const yest = new Date(Date.now() - 86400000);
              draft.patchDraft({ expenseDateIso: yest.toISOString() });
              setDateModalOpen(false);
            }}
          />
        </View>
        <ChiaNeInput
          label="Hoặc nhập ngày (DD/MM/YYYY)"
          value={dateText}
          onChangeText={(t) => {
            setDateText(t);
            if (dateError) setDateError(null);
          }}
          placeholder="20/11/2026"
          errorText={dateError}
        />
      </BottomSheetModal>

      {/* Note BottomSheet */}
      <BottomSheetModal
        visible={noteModalOpen}
        onClose={() => setNoteModalOpen(false)}
        title="Ghi chú khoản chi"
        footer={
          <View style={styles.modalActions}>
            <ChiaNeButton
              label="Lưu ghi chú"
              variant="primary"
              onPress={() => {
                const trimmedReceipt = receiptInput.trim();
                const keepDataImage =
                  !trimmedReceipt && draft.receiptImageUrl.startsWith('data:image/');
                draft.patchDraft({
                  note: noteInput,
                  ...(keepDataImage ? {} : { receiptImageUrl: trimmedReceipt }),
                });
                if (!keepDataImage) {
                  setReceiptImageUri(trimmedReceipt);
                }
                setNoteModalOpen(false);
              }}
            />
            <ChiaNeButton
              label="Đóng"
              variant="quiet"
              onPress={() => setNoteModalOpen(false)}
            />
          </View>
        }
      >
        <ChiaNeInput
          label="Ghi chú"
          value={noteInput}
          onChangeText={setNoteInput}
          placeholder="Ví dụ: Quán nướng gần chợ đêm"
          maxLength={300}
        />
        <ChiaNeInput
          label="Mã / liên kết hóa đơn (không bắt buộc)"
          value={receiptInput}
          onChangeText={setReceiptInput}
          placeholder="https://... hoặc mã hóa đơn"
          autoCapitalize="none"
          maxLength={500}
        />
      </BottomSheetModal>

      {/* Item Assignee BottomSheet */}
      <BottomSheetModal
        visible={activeItemIndex !== null && Boolean(draft.scannedItems[activeItemIndex])}
        onClose={() => setActiveItemIndex(null)}
        title={
          activeItemIndex !== null && draft.scannedItems[activeItemIndex]
            ? draft.scannedItems[activeItemIndex]!.name
            : undefined
        }
        subtitle={
          activeItemIndex !== null && draft.scannedItems[activeItemIndex]
            ? `Giá món: ${formatVnd(
                draft.scannedItems[activeItemIndex]!.priceVnd
              )} · Không chọn ai = Cả bàn chia đều`
            : undefined
        }
        scrollable
        footer={
          <View style={styles.modalActions}>
            <ChiaNeButton
              label="Chọn tất cả (Cả bàn)"
              variant="secondary"
              onPress={resetActiveItemToAll}
            />
            <ChiaNeButton
              label="Xong"
              variant="primary"
              onPress={() => setActiveItemIndex(null)}
            />
          </View>
        }
      >
        {activeItemIndex !== null && draft.scannedItems[activeItemIndex] ? (
          <View style={styles.modalList}>
            {members.map((member) => {
              const currentIds =
                draft.scannedItems[activeItemIndex!]!.assignedMemberIds ?? [];
              const checked = currentIds.includes(member.id);
              return (
                <ScalePressable
                  key={member.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  onPress={() => toggleMemberForActiveItem(member.id)}
                  scaleTo={0.98}
                  style={[styles.payerRow, checked && styles.payerRowSelected]}
                >
                  <View style={styles.memberAvatarRow}>
                    <AvatarBadge
                      name={member.displayName}
                      size={30}
                      highlight={checked}
                    />
                    <Text style={styles.payerName}>
                      {member.displayName}
                      {member.isMe ? ' (bạn)' : ''}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.checkbox,
                      checked ? styles.checkboxOn : styles.checkboxOff,
                    ]}
                  >
                    {checked ? <IconCheck width={14} height={14} /> : null}
                  </View>
                </ScalePressable>
              );
            })}
          </View>
        ) : null}
      </BottomSheetModal>

      {/* Lucky Wheel Modal */}
      <LuckyWheelModal
        visible={luckyWheelOpen}
        members={members}
        onClose={() => setLuckyWheelOpen(false)}
        onSelectWinner={(winner, mode) => {
          if (mode === 'TREAT_ALL') {
            setItemizedOverflowed(false);
            draft.patchDraft({
              paidByMemberId: winner.id,
              splitMethod: 'EQUAL',
              participantIds: [winner.id],
              isPaidFromPot: false,
              scannedItems: [],
            });
            setScanNotice(`🎉 ${winner.displayName} bao trọn chầu này!`);
          } else {
            draft.patchDraft({
              paidByMemberId: winner.id,
              isPaidFromPot: false,
            });
          }
          setLuckyWheelOpen(false);
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  groupBadge: {
    flexShrink: 1,
    backgroundColor: colors.lavender,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  groupBadgeText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.purple,
  },
  ocrCompactPill: {
    backgroundColor: colors.forest,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...shadows.card,
  },
  ocrCompactPillText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.lime,
  },
  amountCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    ...shadows.card,
  },
  amountEyebrow: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 0.4,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  amountInput: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 38,
    lineHeight: 50,
    color: colors.forest,
    paddingVertical: 2,
  },
  currencySymbol: {
    fontFamily: fonts.semiBold,
    fontSize: 22,
    color: colors.muted,
    marginLeft: 8,
  },
  ocrCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 10,
    ...shadows.card,
  },
  scanningBox: {
    backgroundColor: colors.lavender,
    borderRadius: 10,
    padding: 10,
  },
  scanningText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.purple,
    textAlign: 'center',
  },
  ocrNoticeBox: {
    backgroundColor: colors.peach,
    borderRadius: 10,
    padding: 10,
  },
  ocrNoticeSuccessBox: {
    backgroundColor: colors.lime,
  },
  ocrNoticeText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.coral,
  },
  ocrNoticeSuccessText: {
    fontFamily: fonts.medium,
    color: colors.forest,
  },
  receiptPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.paper,
    padding: 8,
    borderRadius: 10,
  },
  receiptPreviewThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.line,
  },
  receiptPreviewMeta: {
    flex: 1,
    gap: 4,
  },
  receiptAttachedText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.ink,
  },
  removeReceiptText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.coral,
  },
  scannedItemsWrap: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 10,
  },
  scannedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scannedItemsHeading: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.muted,
  },
  scannedItemsList: {
    gap: 8,
  },
  scannedItemCard: {
    backgroundColor: colors.paper,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  scannedItemCardAssigned: {
    borderColor: colors.purple,
    backgroundColor: '#FAF8FF',
  },
  scannedItemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scannedItemBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scannedItemName: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.ink,
    flex: 1,
    marginRight: 8,
  },
  scannedItemPrice: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.forest,
  },
  itemAssigneeChip: {
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.line,
    maxWidth: '72%',
  },
  itemAssigneeChipActive: {
    backgroundColor: colors.lavender,
    borderColor: colors.purple,
  },
  itemAssigneeChipText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.ink,
  },
  itemAssigneeChipTextActive: {
    fontFamily: fonts.semiBold,
    color: colors.purple,
  },
  itemEditHint: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.forest,
  },
  itemizedSummaryCard: {
    backgroundColor: colors.lime,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginTop: 2,
  },
  itemizedSummaryTitle: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.forest,
  },
  itemizedSummaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  itemizedMemberChip: {
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  itemizedMemberName: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.ink,
    flex: 1,
  },
  itemizedMemberAmount: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.forest,
  },
  itemizedOverflowNote: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.coral,
  },
  fieldLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.ink,
    marginBottom: 8,
  },
  categoryChipsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  settingsCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    ...shadows.card,
  },
  settingRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  payerSettingWrap: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  settingRowFlex: {
    flex: 1,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  wheelPillBtn: {
    backgroundColor: colors.lavender,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  wheelPillText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.purple,
  },
  quickSplitStripWrap: {
    paddingBottom: 12,
  },
  quickSplitStrip: {
    flexDirection: 'row',
    gap: 8,
  },
  memberSplitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.paper,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 10,
    maxWidth: 132,
  },
  memberSplitChipOn: {
    backgroundColor: colors.lime,
    borderColor: colors.forest,
  },
  memberSplitName: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    flexShrink: 1,
  },
  memberSplitNameOn: {
    fontFamily: fonts.semiBold,
    color: colors.forest,
  },
  potToggleRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
  },
  potToggleTextCol: {
    flex: 1,
    gap: 2,
  },
  potToggleTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
  },
  potToggleSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.forest,
  },
  checkboxOff: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  pressed: {
    opacity: 0.8,
  },
  settingLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  settingValue: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.ink,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
  },
  noteBar: {
    minHeight: sizes.minTouchTarget,
    backgroundColor: colors.white,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  noteBarText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.coral,
  },
  modalList: {
    gap: 8,
  },
  payerRow: {
    minHeight: 50,
    borderRadius: radii.iconBadge,
    backgroundColor: colors.paper,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  payerRowSelected: {
    backgroundColor: colors.lime,
  },
  payerName: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  quickDatesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inlinePickerCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderColor: colors.forest,
    padding: 14,
    gap: 12,
  },
  inlinePickerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  inlinePickerTitleCol: {
    flex: 1,
    gap: 2,
  },
  inlinePickerTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.forest,
  },
  inlinePickerSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  inlinePickerClose: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.muted,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  inlinePickerBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inlineCameraBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  inlineCameraBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.lime,
  },
  inlineGalleryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: colors.lavender,
    borderWidth: 1,
    borderColor: 'rgba(110, 85, 165, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  inlineGalleryBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.purple,
  },
  modalActions: {
    gap: 10,
  },
});
