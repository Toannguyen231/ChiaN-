import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Modal,
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
  ChiaNeButton,
  ChiaNeChip,
  ChiaNeInput,
  ScreenContainer,
  StateView,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { expensesApi } from '../../services/expensesApi';
import { ocrApi } from '../../services/ocrApi';
import { useExpenseDraftStore } from '../../store/expenseDraftStore';
import { useGroupsStore } from '../../store/groupsStore';
import { useOfflineQueueStore } from '../../store/offlineQueueStore';
import { colors, fonts, radii, sizes, typography } from '../../theme/tokens';

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
  const { groupId, expenseId } = route.params;
  const isEdit = Boolean(expenseId);

  const cachedGroup = useGroupsStore((s) => s.groupDetailsById[groupId]);
  const fetchGroupDetail = useGroupsStore((s) => s.fetchGroupDetail);
  const enqueueExpense = useOfflineQueueStore((s) => s.enqueueExpense);

  const draft = useExpenseDraftStore();

  const [loading, setLoading] = useState(!cachedGroup || isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
  const [scannedItems, setScannedItems] = useState<ReceiptItemDto[]>([]);
  const [receiptImageUri, setReceiptImageUri] = useState<string>(draft.receiptImageUrl || '');

  const initialize = useCallback(async () => {
    setLoadError(null);
    try {
      const groupDetail =
        useGroupsStore.getState().groupDetailsById[groupId] ??
        (await fetchGroupDetail(groupId));

      if (expenseId) {
        const res = await expensesApi.getExpense(expenseId);
        draft.initFromExpense(res.expense, groupDetail.members);
        setReceiptImageUri(res.expense.receiptImageUrl ?? '');
      } else if (draft.groupId !== groupId || draft.expenseId !== null) {
        draft.initNew(groupId, groupDetail.members, groupDetail.myMemberId);
        setReceiptImageUri('');
        setScannedItems([]);
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

  const handlePickImage = async (fromCamera: boolean) => {
    setPhotoPickerOpen(false);
    setScanNotice(null);

    try {
      if (fromCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setScanNotice('Cần cấp quyền máy ảnh để chụp hóa đơn.');
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setScanNotice('Cần cấp quyền truy cập ảnh để tải hóa đơn.');
          return;
        }
      }

      const pickerFn = fromCamera
        ? ImagePicker.launchCameraAsync
        : ImagePicker.launchImageLibraryAsync;

      const result = await pickerFn({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.65,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];
      const mimeType = asset.mimeType || 'image/jpeg';
      const imageUri = asset.uri;
      const base64Data = asset.base64;

      setReceiptImageUri(imageUri);
      if (base64Data) {
        draft.patchDraft({ receiptImageUrl: `data:${mimeType};base64,${base64Data}` });
      } else {
        draft.patchDraft({ receiptImageUrl: imageUri });
      }

      if (!base64Data) {
        setScanNotice('Đã đính kèm ảnh. Không thể đọc base64 để phân tích AI.');
        return;
      }

      setScanningReceipt(true);
      try {
        const ocrRes = await ocrApi.scanReceipt({
          imageBase64: base64Data,
          mimeType,
        });

        const scan = ocrRes.scan;
        if (scan.totalVnd > 0) {
          draft.patchDraft({ amountVnd: scan.totalVnd });
        }
        if (scan.detectedMerchant && !draft.title.trim()) {
          draft.patchDraft({ title: scan.detectedMerchant });
        }
        if (scan.detectedCategory) {
          draft.patchDraft({ category: scan.detectedCategory });
        }
        if (scan.items && scan.items.length > 0) {
          setScannedItems(scan.items);
        }
        if (scan.notice) {
          setScanNotice(scan.notice);
        }
      } catch (ocrErr) {
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
    }
  };

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const group = cachedGroup ?? useGroupsStore.getState().groupDetailsById[groupId];
  const members = group?.members ?? [];

  const payerName =
    members.find((m) => m.id === draft.paidByMemberId)?.displayName ?? 'Chọn người trả';

  const splitMethodLabel =
    draft.splitMethod === 'EQUAL'
      ? 'Chia đều'
      : draft.splitMethod === 'EXACT'
        ? 'Số tiền'
        : 'Phần trăm';

  const handleAmountChange = (raw: string) => {
    const nextAmount = parseVndInput(raw);
    draft.patchDraft({ amountVnd: nextAmount });
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
    setReceiptInput(draft.receiptImageUrl);
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
          receiptImageUrl: draft.receiptImageUrl.trim()
            ? draft.receiptImageUrl.trim()
            : null,
        });
        await fetchGroupDetail(groupId);
        draft.clearDraft();
        navigation.goBack();
      } else {
        const clientMutationId = `chiane_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 10)}`;
        try {
          await expensesApi.createExpense(groupId, {
            ...basePayload,
            clientMutationId,
          });
          await fetchGroupDetail(groupId);
          draft.clearDraft();
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
            disabled={draft.amountVnd <= 0 || !draft.title.trim()}
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
          <View style={styles.groupBadge}>
            <Text style={styles.groupBadgeText} numberOfLines={1}>
              {group.name}
            </Text>
          </View>

          {/* AI Receipt Scanning Banner */}
          <View style={styles.ocrCard}>
            <View style={styles.ocrHeaderRow}>
              <View style={styles.ocrTitleCol}>
                <Text style={styles.ocrBadge}>✨ AI GEMINI VISION</Text>
                <Text style={styles.ocrTitle}>Quét hóa đơn tự động</Text>
                <Text style={styles.ocrSubtitle}>
                  Tự động đọc tổng tiền, phân loại & nhận diện món
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPhotoPickerOpen(true)}
                disabled={scanningReceipt}
                style={({ pressed }) => [
                  styles.ocrScanBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.ocrScanBtnText}>
                  {scanningReceipt
                    ? 'Đang quét...'
                    : receiptImageUri
                      ? 'Đổi ảnh'
                      : 'Quét ảnh'}
                </Text>
              </Pressable>
            </View>

            {scanningReceipt ? (
              <View style={styles.scanningBox}>
                <Text style={styles.scanningText}>
                  ⏳ AI đang đọc các món và tính tổng tiền hóa đơn...
                </Text>
              </View>
            ) : null}

            {scanNotice ? (
              <View style={styles.ocrNoticeBox}>
                <Text style={styles.ocrNoticeText}>{scanNotice}</Text>
              </View>
            ) : null}

            {receiptImageUri ? (
              <View style={styles.receiptPreviewRow}>
                <Image
                  source={{ uri: receiptImageUri }}
                  style={styles.receiptPreviewThumb}
                  resizeMode="cover"
                />
                <View style={styles.receiptPreviewMeta}>
                  <Text style={styles.receiptAttachedText}>Đã đính kèm ảnh hóa đơn</Text>
                  <Pressable
                    onPress={() => {
                      setReceiptImageUri('');
                      draft.patchDraft({ receiptImageUrl: '' });
                      setScannedItems([]);
                    }}
                  >
                    <Text style={styles.removeReceiptText}>Gỡ ảnh</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {scannedItems.length > 0 ? (
              <View style={styles.scannedItemsWrap}>
                <Text style={styles.scannedItemsHeading}>
                  Món nhận diện ({scannedItems.length} món):
                </Text>
                <View style={styles.scannedItemsList}>
                  {scannedItems.map((item, idx) => (
                    <View key={`${item.name}_${idx}`} style={styles.scannedItemRow}>
                      <Text style={styles.scannedItemName} numberOfLines={1}>
                        {item.quantity && item.quantity > 1 ? `${item.quantity}x ` : ''}
                        {item.name}
                      </Text>
                      <Text style={styles.scannedItemPrice}>
                        {formatVnd(item.priceVnd)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          <Text style={styles.amountEyebrow}>SỐ TIỀN</Text>
          <View style={styles.amountRow}>
            <TextInput
              value={formattedAmountInput}
              onChangeText={handleAmountChange}
              placeholder="0"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              style={styles.amountInput}
              maxLength={14}
            />
            <Text style={styles.currencySymbol}>₫</Text>
          </View>

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

          <View style={styles.settingsCard}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPayerModalOpen(true)}
              style={({ pressed }) => [
                styles.settingRow,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.settingLabel}>Người trả</Text>
              <View style={styles.settingRight}>
                <Text style={styles.settingValue}>{payerName}</Text>
                <IconChevron width={16} height={16} />
              </View>
            </Pressable>

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
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={handleOpenNoteModal}
            style={({ pressed }) => [styles.noteBar, pressed && styles.pressed]}
          >
            <IconReceipt width={22} height={22} />
            <Text style={styles.noteBarText} numberOfLines={1}>
              {draft.note.trim()
                ? `Ghi chú: ${draft.note.trim()}`
                : receiptImageUri
                  ? '🧾 Đã đính kèm ảnh hóa đơn · Bấm để sửa'
                  : 'Thêm ảnh hóa đơn hoặc ghi chú'}
            </Text>
          </Pressable>

          {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        </View>
      ) : null}

      {/* Payer Picker Modal */}
      <Modal
        visible={payerModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPayerModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPayerModalOpen(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Ai đã trả khoản này?</Text>
            <View style={styles.modalList}>
              {members.map((member) => {
                const selected = member.id === draft.paidByMemberId;
                return (
                  <Pressable
                    key={member.id}
                    onPress={() => {
                      draft.patchDraft({ paidByMemberId: member.id });
                      setPayerModalOpen(false);
                    }}
                    style={[
                      styles.payerRow,
                      selected && styles.payerRowSelected,
                    ]}
                  >
                    <Text style={styles.payerName}>
                      {member.displayName}
                      {member.isMe ? ' (bạn)' : ''}
                    </Text>
                    {selected ? (
                      <View style={styles.checkBadge}>
                        <IconCheck width={14} height={14} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <ChiaNeButton
              label="Đóng"
              variant="quiet"
              onPress={() => setPayerModalOpen(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Date Picker Modal */}
      <Modal
        visible={dateModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDateModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setDateModalOpen(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Chọn ngày chi</Text>
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
          </Pressable>
        </Pressable>
      </Modal>

      {/* Note & Receipt Modal */}
      <Modal
        visible={noteModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNoteModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setNoteModalOpen(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Ghi chú & Hóa đơn</Text>
            <ChiaNeInput
              label="Ghi chú khoản chi"
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder="Ví dụ: Quán nướng gần chợ đêm"
              maxLength={300}
            />
            <ChiaNeInput
              label="Liên kết / mã hóa đơn (không bắt buộc)"
              value={receiptInput}
              onChangeText={setReceiptInput}
              placeholder="https://... hoặc mã hóa đơn"
              autoCapitalize="none"
              maxLength={500}
            />
            <View style={styles.modalPhotoRow}>
              <ChiaNeButton
                label={receiptImageUri ? '📷 Đổi ảnh chụp hóa đơn' : '📷 Chụp hoặc tải ảnh hóa đơn'}
                variant="quiet"
                onPress={() => {
                  setNoteModalOpen(false);
                  setPhotoPickerOpen(true);
                }}
              />
            </View>
            <View style={styles.modalActions}>
              <ChiaNeButton
                label="Lưu ghi chú"
                variant="primary"
                onPress={() => {
                  draft.patchDraft({
                    note: noteInput,
                    receiptImageUrl: receiptInput,
                  });
                  setNoteModalOpen(false);
                }}
              />
              <ChiaNeButton
                label="Đóng"
                variant="quiet"
                onPress={() => setNoteModalOpen(false)}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Photo Picker Modal */}
      <Modal
        visible={photoPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoPickerOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPhotoPickerOpen(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Quét hóa đơn AI</Text>
            <Text style={styles.modalSubtitle}>
              Chụp ảnh hóa đơn hoặc chọn ảnh từ máy, AI sẽ tự đọc tổng tiền và gợi ý các món.
            </Text>
            <View style={styles.photoPickerOptions}>
              <ChiaNeButton
                label="📷 Chụp ảnh mới"
                variant="primary"
                onPress={() => void handlePickImage(true)}
              />
              <ChiaNeButton
                label="🖼️ Chọn ảnh từ máy"
                variant="quiet"
                onPress={() => void handlePickImage(false)}
              />
              <ChiaNeButton
                label="Hủy"
                variant="quiet"
                onPress={() => setPhotoPickerOpen(false)}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 18,
  },
  groupBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.lavender,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  groupBadgeText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.purple,
  },
  ocrCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 12,
  },
  ocrHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  ocrTitleCol: {
    flex: 1,
    gap: 2,
  },
  ocrBadge: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.purple,
    letterSpacing: 0.5,
  },
  ocrTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  ocrSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    lineHeight: 15,
  },
  ocrScanBtn: {
    backgroundColor: colors.forest,
    borderRadius: radii.button,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ocrScanBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.white,
  },
  scanningBox: {
    backgroundColor: colors.lavender,
    borderRadius: 8,
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
    borderRadius: 8,
    padding: 10,
  },
  ocrNoticeText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.coral,
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
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 10,
  },
  scannedItemsHeading: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.muted,
  },
  scannedItemsList: {
    backgroundColor: colors.paper,
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  scannedItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scannedItemName: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.ink,
    flex: 1,
    marginRight: 8,
  },
  scannedItemPrice: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.forest,
  },
  amountEyebrow: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: colors.muted,
    marginTop: 4,
    marginBottom: -12,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: 6,
  },
  amountInput: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 42,
    lineHeight: 54,
    color: colors.forest,
    paddingVertical: 4,
  },
  currencySymbol: {
    fontFamily: fonts.semiBold,
    fontSize: 22,
    color: colors.muted,
    marginLeft: 8,
  },
  fieldLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.ink,
    marginBottom: 10,
  },
  categoryChipsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  settingsCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    paddingHorizontal: 16,
  },
  settingRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
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
    backgroundColor: colors.lavender,
    borderRadius: radii.input,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  noteBarText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.purple,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.coral,
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
    gap: 14,
  },
  modalTitle: {
    ...typography.title,
    color: colors.ink,
  },
  modalList: {
    gap: 8,
  },
  payerRow: {
    minHeight: 48,
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
  quickDatesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
  },
  modalPhotoRow: {
    marginVertical: 4,
  },
  photoPickerOptions: {
    gap: 10,
    marginTop: 6,
  },
  modalActions: {
    gap: 10,
  },
});
