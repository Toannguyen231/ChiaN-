import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { formatVnd, type ExpenseCategory } from '@chiane/shared';
import IconCoffee from '../../../assets/figma/icon-coffee.svg';
import IconFood from '../../../assets/figma/icon-food.svg';
import IconReceipt from '../../../assets/figma/icon-receipt.svg';
import IconStay from '../../../assets/figma/icon-expense-stay.svg';
import IconTransport from '../../../assets/figma/icon-taxi.svg';
import {
  AppHeader,
  ChiaNeButton,
  ConfirmDialog,
  IconTrash,
  ScreenContainer,
  StateView,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { expensesApi, type ExpenseDetailResponse } from '../../services/expensesApi';
import { colors, fonts, radii } from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'ExpenseDetails'>;

const CATEGORY_VISUAL: Record<
  ExpenseCategory,
  { badgeBg: string; Icon: React.FC<{ width?: number; height?: number }> }
> = {
  FOOD: { badgeBg: colors.peach, Icon: IconFood },
  STAY: { badgeBg: colors.lavender, Icon: IconStay },
  TRANSPORT: { badgeBg: colors.lime, Icon: IconTransport },
  COFFEE: { badgeBg: colors.peach, Icon: IconCoffee },
  OTHER: { badgeBg: colors.paper, Icon: IconReceipt },
};

function formatDateDdMmYyyy(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, '0')}/${d.getFullYear()}`;
}

function formatTimeHhMm(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

export function ExpenseDetailsScreen({ navigation, route }: Props) {
  const { expenseId } = route.params;

  const [detail, setDetail] = useState<ExpenseDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadExpense = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const data = await expensesApi.getExpense(expenseId);
      setDetail(data);
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể tải chi tiết khoản chi.'
      );
    } finally {
      setLoading(false);
    }
  }, [expenseId]);

  useFocusEffect(
    useCallback(() => {
      void loadExpense();
    }, [loadExpense])
  );

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await expensesApi.deleteExpense(expenseId);
      setDeleteConfirm(false);
      navigation.goBack();
    } catch (err) {
      setDeleteConfirm(false);
      setErrorText(
        err instanceof ApiClientError ? err.message : 'Không thể xóa khoản chi.'
      );
    } finally {
      setDeleting(false);
    }
  };

  const expense = detail?.expense;
  const visual = expense
    ? CATEGORY_VISUAL[expense.category]
    : CATEGORY_VISUAL.FOOD;
  const CategoryIcon = visual.Icon;

  const splitLabel =
    expense?.splitMethod === 'EQUAL'
      ? `Đã chia đều cho ${expense.splitCount} người`
      : expense?.splitMethod === 'PERCENTAGE'
        ? `Đã chia theo % cho ${expense.splitCount} người`
        : `Đã chia theo số tiền cho ${expense?.splitCount ?? 0} người`;

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      header={
        <AppHeader
          title="Chi tiết khoản chi"
          onBack={() => navigation.goBack()}
          rightSlot={
            detail?.canDelete ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Xóa khoản chi"
                hitSlop={8}
                onPress={() => setDeleteConfirm(true)}
              >
                <IconTrash width={21} height={21} color={colors.coral} />
              </Pressable>
            ) : undefined
          }
        />
      }
      footer={
        detail?.canEdit && expense ? (
          <ChiaNeButton
            label="Chỉnh sửa khoản chi"
            variant="primary"
            onPress={() =>
              navigation.navigate('AddExpense', {
                groupId: expense.groupId,
                expenseId: expense.id,
              })
            }
          />
        ) : undefined
      }
    >
      {loading && !detail ? (
        <StateView kind="loading" title="Đang tải khoản chi..." />
      ) : errorText && !detail ? (
        <StateView
          kind="error"
          title="Chưa tải được khoản chi"
          description={errorText}
          actionLabel="Thử lại"
          onAction={() => void loadExpense()}
        />
      ) : expense ? (
        <View style={styles.content}>
          {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

          <View style={styles.receiptCard}>
            <View style={[styles.badge, { backgroundColor: visual.badgeBg }]}>
              <CategoryIcon width={24} height={24} />
            </View>
            <Text style={styles.title}>{expense.title}</Text>
            <Text style={styles.amount}>{formatVnd(expense.amountVnd)}</Text>
            <Text style={styles.meta}>
              {`${expense.paidByName} đã trả · ${formatDateDdMmYyyy(expense.expenseDate)}`}
            </Text>
            {expense.note ? (
              <View style={styles.noteBox}>
                <Text style={styles.noteText}>{expense.note}</Text>
              </View>
            ) : null}
            {expense.receiptImageUrl ? (
              <Text style={styles.receiptLink}>
                Hóa đơn đính kèm: {expense.receiptImageUrl}
              </Text>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>Mỗi người một phần</Text>

          <View style={styles.splitsCard}>
            {expense.splits.map((split, index) => (
              <React.Fragment key={split.id}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <View style={styles.splitRow}>
                  <Text style={styles.splitName}>
                    {split.memberName}
                    {split.isMe ? ' (bạn)' : ''}
                    {split.isPayer ? ' · người trả' : ''}
                  </Text>
                  <Text style={styles.splitAmount}>
                    {formatVnd(split.amountVnd)}
                  </Text>
                </View>
              </React.Fragment>
            ))}
          </View>

          <View style={styles.auditCard}>
            <IconReceipt width={22} height={22} />
            <View style={styles.auditTextCol}>
              <Text style={styles.auditTitle}>{splitLabel}</Text>
              <Text style={styles.auditSub}>
                {`Thêm bởi ${expense.createdByName} lúc ${formatTimeHhMm(expense.createdAt)}\nMọi thay đổi đều hiển thị trong lịch sử nhóm.`}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <ConfirmDialog
        visible={deleteConfirm}
        title="Xóa khoản chi này?"
        description="Khoản chi sẽ được gỡ khỏi tổng chi tiêu và số dư của nhóm sẽ tự động tính lại ngay."
        confirmLabel="Xóa khoản chi"
        destructive
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteConfirm(false)}
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
  receiptCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: 18,
    color: colors.ink,
    textAlign: 'center',
  },
  amount: {
    fontFamily: fonts.bold,
    fontSize: 32,
    lineHeight: 42,
    color: colors.forest,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
  noteBox: {
    marginTop: 6,
    backgroundColor: colors.paper,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: '100%',
  },
  noteText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.ink,
    textAlign: 'center',
  },
  receiptLink: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.purple,
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 17,
    color: colors.ink,
    marginTop: 4,
  },
  splitsCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  splitRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  splitName: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.ink,
    flex: 1,
  },
  splitAmount: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
  },
  auditCard: {
    backgroundColor: colors.lavender,
    borderRadius: radii.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  auditTextCol: {
    flex: 1,
    gap: 4,
  },
  auditTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.purple,
  },
  auditSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 17,
    color: colors.purple,
  },
});
