import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AppHeader,
  ChiaNeButton,
  InfoCard,
  ScreenContainer,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { authApi } from '../../services/authApi';
import { useAuthStore } from '../../store/authStore';
import { colors, fonts, radii } from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'NotificationPreferences'>;

export function NotificationPreferencesScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const [notifyReminders, setNotifyReminders] = useState(
    user?.notifyReminders ?? true
  );
  const [notifyExpenses, setNotifyExpenses] = useState(
    user?.notifyExpenses ?? true
  );
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [hasPushToken, setHasPushToken] = useState<boolean | null>(null);
  const [pushActionBusy, setPushActionBusy] = useState(false);

  useEffect(() => {
    let active = true;
    authApi
      .getPushTokenStatus()
      .then((res) => {
        if (active) setHasPushToken(res.registered);
      })
      .catch(() => {
        if (active) setHasPushToken(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleClearPushToken = async () => {
    setPushActionBusy(true);
    try {
      await authApi.registerPushToken(null);
      setHasPushToken(false);
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể cập nhật trạng thái Push Notification.'
      );
    } finally {
      setPushActionBusy(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorText(null);
    setSavedNotice(false);
    try {
      await authApi.updateMe({ notifyReminders, notifyExpenses });
      await refreshProfile();
      setSavedNotice(true);
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể lưu tùy chọn thông báo.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      header={
        <AppHeader
          title="Thông báo & nhắc nhẹ"
          onBack={() => navigation.goBack()}
        />
      }
      footer={
        <ChiaNeButton
          label="Lưu tùy chọn"
          variant="primary"
          loading={saving}
          onPress={() => void handleSave()}
        />
      }
    >
      <View style={styles.content}>
        {savedNotice ? (
          <InfoCard tone="lime">
            <Text style={styles.savedText}>Đã lưu cài đặt thông báo của bạn.</Text>
          </InfoCard>
        ) : null}

        {errorText ? (
          <InfoCard tone="peach">
            <Text style={styles.errorText}>{errorText}</Text>
          </InfoCard>
        ) : null}

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.textCol}>
              <Text style={styles.rowTitle}>Nhắc nhẹ thanh toán</Text>
              <Text style={styles.rowSub}>
                Nhận thông báo khi bạn bè gửi lời nhắc nhẹ hoặc xác nhận đã nhận tiền.
              </Text>
            </View>
            <Switch
              value={notifyReminders}
              onValueChange={(v) => {
                setNotifyReminders(v);
                setSavedNotice(false);
              }}
              trackColor={{ false: colors.line, true: colors.lime }}
              thumbColor={notifyReminders ? colors.forest : colors.white}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.textCol}>
              <Text style={styles.rowTitle}>Khoản chi & cập nhật nhóm</Text>
              <Text style={styles.rowSub}>
                Cập nhật khi có khoản chi mới, chỉnh sửa hoặc thành viên mới tham gia.
              </Text>
            </View>
            <Switch
              value={notifyExpenses}
              onValueChange={(v) => {
                setNotifyExpenses(v);
                setSavedNotice(false);
              }}
              trackColor={{ false: colors.line, true: colors.lime }}
              thumbColor={notifyExpenses ? colors.forest : colors.white}
            />
          </View>
        </View>

        <View style={styles.pushCard}>
          <View style={styles.pushHeaderRow}>
            <Text style={styles.rowTitle}>Thông báo đẩy (Push Notification)</Text>
            <View
              style={[
                styles.pushBadge,
                hasPushToken ? styles.pushBadgeActive : styles.pushBadgeIdle,
              ]}
            >
              <Text
                style={[
                  styles.pushBadgeText,
                  hasPushToken ? styles.pushBadgeTextActive : styles.pushBadgeTextIdle,
                ]}
              >
                {hasPushToken === null
                  ? 'Đang kiểm tra...'
                  : hasPushToken
                    ? 'Đã kết nối thiết bị'
                    : 'Sẵn sàng (chờ EAS build)'}
              </Text>
            </View>
          </View>
          <Text style={styles.rowSub}>
            Backend đã kích hoạt Expo Push API cho chi tiêu mới, xác nhận chuyển khoản và nhắc nhẹ. Thông báo đẩy nền sẽ tự động đăng ký token thiết bị trên bản cài đặt .apk / TestFlight (EAS Build + FCM/APNs).
          </Text>
          {hasPushToken ? (
            <Pressable
              accessibilityRole="button"
              disabled={pushActionBusy}
              onPress={() => void handleClearPushToken()}
              style={styles.clearPushBtn}
            >
              <Text style={styles.clearPushBtnText}>
                {pushActionBusy ? 'Đang gỡ...' : 'Hủy đăng ký thiết bị này'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <InfoCard tone="lavender">
          <Text style={styles.noteText}>
            ChiaNè luôn giữ giới hạn tối đa 1 lời nhắc / người / 24 giờ để không làm phiền bạn bè.
          </Text>
        </InfoCard>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingTop: 8,
  },
  savedText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.forest,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.coral,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  row: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingVertical: 12,
  },
  textCol: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  rowSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
  },
  noteText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.purple,
  },
  pushCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 8,
  },
  pushHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  pushBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pushBadgeActive: {
    backgroundColor: colors.lime,
  },
  pushBadgeIdle: {
    backgroundColor: colors.paper,
  },
  pushBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
  },
  pushBadgeTextActive: {
    color: colors.forest,
  },
  pushBadgeTextIdle: {
    color: colors.muted,
  },
  clearPushBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  clearPushBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.coral,
  },
});
