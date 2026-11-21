import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { formatVnd, type GroupBalancesDto } from '@chiane/shared';
import IconBell from '../../../assets/figma/icon-bell.svg';
import {
  AppHeader,
  ChiaNeButton,
  IconClock,
  InfoCard,
  ScreenContainer,
  StateView,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { activityApi } from '../../services/activityApi';
import { ApiClientError } from '../../services/apiClient';
import { settlementsApi } from '../../services/settlementsApi';
import { colors, fonts, radii } from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'FriendlyReminder'>;

export function FriendlyReminderScreen({ navigation, route }: Props) {
  const { groupId, recipientMemberId, creditorName, amountVnd } = route.params;

  const [balances, setBalances] = useState<GroupBalancesDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

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
          : 'Không thể tải thông tin lời nhắc.'
      );
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  const recipient = balances?.memberBalances.find(
    (m) => m.memberId === recipientMemberId
  );
  const myMember = balances?.memberBalances.find((m) => m.isMe);
  const effectiveAmount =
    amountVnd ??
    (recipient && recipient.netBalanceVnd < 0
      ? Math.abs(recipient.netBalanceVnd)
      : 100000);
  const targetCreditor = creditorName || myMember?.displayName || 'nhóm';

  useEffect(() => {
    if (balances && recipient && !message) {
      setMessage(
        `${recipient.displayName} ơi, phần ${balances.groupName} của bạn còn ${formatVnd(effectiveAmount)} gửi ${targetCreditor}. Khi nào tiện bạn xem giúp mình nhé!`
      );
    }
  }, [balances, effectiveAmount, message, recipient, targetCreditor]);

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setErrorText('Lời nhắn không được để trống.');
      return;
    }

    setSending(true);
    setErrorText(null);
    try {
      await activityApi.sendReminder(groupId, {
        recipientMemberId,
        amountVnd: effectiveAmount,
        message: trimmed,
      });
      setSentSuccess(true);
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể gửi lời nhắc lúc này.'
      );
    } finally {
      setSending(false);
    }
  };

  const handleShareExternal = async () => {
    await Share.share({ message: message.trim() });
  };

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      header={
        <AppHeader title="Nhắc nhẹ bạn bè" onBack={() => navigation.goBack()} />
      }
      footer={
        balances && recipient ? (
          sentSuccess ? (
            <View style={styles.footerStack}>
              <ChiaNeButton
                label="Gửi thêm qua Zalo / Tin nhắn"
                variant="secondary"
                onPress={() => void handleShareExternal()}
              />
              <ChiaNeButton
                label="Quay lại"
                variant="primary"
                onPress={() => navigation.goBack()}
              />
            </View>
          ) : (
            <ChiaNeButton
              label="Gửi lời nhắc"
              variant="primary"
              loading={sending}
              disabled={!message.trim()}
              onPress={() => void handleSend()}
            />
          )
        ) : undefined
      }
    >
      {loading && !balances ? (
        <StateView kind="loading" title="Đang chuẩn bị lời nhắc..." />
      ) : !balances || !recipient ? (
        <StateView
          kind="error"
          title="Không tải được thông tin"
          description={errorText ?? undefined}
          actionLabel="Thử lại"
          onAction={() => void loadInfo()}
        />
      ) : sentSuccess ? (
        <View style={styles.contentCenter}>
          <StateView
            kind="success"
            title={`Đã gửi lời nhắc cho ${recipient.displayName}!`}
            description="Lời nhắc đã được ghi nhận nhẹ nhàng vào lịch sử nhóm."
          />
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <IconBell width={44} height={44} />
          </View>

          <Text style={styles.heading}>
            {'Nhắc một chút,\nvẫn vui như thường.'}
          </Text>
          <Text style={styles.subtitle}>
            {`Gửi ${recipient.displayName} · ${formatVnd(effectiveAmount)} cần trả ${targetCreditor}`}
          </Text>

          <View style={styles.messageCard}>
            <Text style={styles.eyebrow}>TIN NHẮN GỢI Ý</Text>
            {editing ? (
              <TextInput
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={300}
                style={styles.messageInput}
                autoFocus
              />
            ) : (
              <Text style={styles.messageBody}>{message}</Text>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setEditing((v) => !v)}
          >
            <Text style={styles.editLink}>
              {editing ? 'Xong chỉnh sửa' : 'Chỉnh lời nhắn'}
            </Text>
          </Pressable>

          {errorText ? (
            <InfoCard tone="peach">
              <Text style={styles.errorText}>{errorText}</Text>
            </InfoCard>
          ) : null}

          <View style={styles.frequencyCard}>
            <IconClock width={25} height={25} color={colors.purple} />
            <Text style={styles.frequencyText}>
              {
                'Tối đa 1 lời nhắc / người / 24 giờ.\nKhông nhắc lại quá dày để luôn giữ không khí vui vẻ.'
              }
            </Text>
          </View>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    paddingTop: 10,
  },
  contentCenter: {
    paddingTop: 28,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.peach,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 4,
  },
  heading: {
    fontFamily: fonts.bold,
    fontSize: 26,
    lineHeight: 36,
    color: colors.ink,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 8,
  },
  messageCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  eyebrow: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: colors.muted,
  },
  messageBody: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.ink,
  },
  messageInput: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.ink,
    minHeight: 84,
    textAlignVertical: 'top',
    padding: 0,
  },
  editLink: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.forest,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 18,
    color: colors.coral,
  },
  frequencyCard: {
    backgroundColor: colors.lavender,
    borderRadius: radii.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  frequencyText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.purple,
  },
  footerStack: {
    gap: 10,
  },
});
