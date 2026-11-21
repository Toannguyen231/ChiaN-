import React, { useState } from 'react';
import { Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import {
  useNavigation,
  type CompositeNavigationProp,
} from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { maskBankAccount } from '@chiane/shared';
import IconBank from '../../../assets/figma/icon-bank.svg';
import IconBell from '../../../assets/figma/icon-bell.svg';
import IconChevron from '../../../assets/figma/icon-chevron.svg';
import IconPlus from '../../../assets/figma/icon-plus.svg';
import IconShield from '../../../assets/figma/icon-shield.svg';
import {
  ChiaNeButton,
  ChiaNeInput,
  ConfirmDialog,
  IconEdit,
  IconGear,
  IconHelp,
  IconOffline,
  IconShare,
  ScreenContainer,
} from '../../components';
import type { AppStackParamList, MainTabParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { authApi } from '../../services/authApi';
import { useAuthStore } from '../../store/authStore';
import { useGroupsStore } from '../../store/groupsStore';
import { useOfflineQueueStore } from '../../store/offlineQueueStore';
import { colors, fonts, radii, sizes, typography } from '../../theme/tokens';

type AccountNav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'AccountTab'>,
  NativeStackNavigationProp<AppStackParamList>
>;

export function AccountScreen() {
  const navigation = useNavigation<AccountNav>();
  const user = useAuthStore((s) => s.user);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const logout = useAuthStore((s) => s.logout);
  const clearGroupsStore = useGroupsStore((s) => s.clearStore);
  const offlineCount = useOfflineQueueStore((s) => s.items.length);

  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [nameInput, setNameInput] = useState(user?.displayName ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  const [helpOpen, setHelpOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const hasBank = Boolean(user?.bankBin && user?.bankAccountNumber);

  const handleOpenEditName = () => {
    setNameInput(user?.displayName ?? '');
    setNameError(null);
    setEditProfileOpen(true);
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError('Tên hiển thị không được để trống.');
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      await authApi.updateMe({ displayName: trimmed });
      await refreshProfile();
      setEditProfileOpen(false);
    } catch (err) {
      setNameError(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể cập nhật tên hiển thị.'
      );
    } finally {
      setSavingName(false);
    }
  };

  const handleShareApp = async () => {
    await Share.share({
      message:
        'Dùng ChiaNè chia tiền nhóm cực gọn với hội bạn nè — chia lẻ từng đồng, tạo mã VietQR rõ ràng! https://chiane.app',
    });
  };

  const handleConfirmLogout = async () => {
    setLoggingOut(true);
    try {
      clearGroupsStore();
      await logout();
    } finally {
      setLoggingOut(false);
      setLogoutOpen(false);
    }
  };

  return (
    <ScreenContainer backgroundColor={colors.paper} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Tài khoản</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cài đặt thông báo"
          hitSlop={8}
          onPress={() => navigation.navigate('NotificationPreferences')}
          style={({ pressed }) => [styles.gearBtn, pressed && styles.pressed]}
        >
          <IconGear width={24} height={24} />
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={styles.profileCard}>
          <Text style={styles.profileName}>
            {user?.displayName?.trim() || 'Thành viên ChiaNè'}
          </Text>
          <Text style={styles.profilePhone}>{user?.maskedPhone ?? ''}</Text>
          <Pressable onPress={handleOpenEditName} hitSlop={8}>
            <Text style={styles.editProfileLink}>Chỉnh sửa hồ sơ</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('BankAccount')}
          style={({ pressed }) => [styles.bankCard, pressed && styles.pressed]}
        >
          <View style={styles.bankTopRow}>
            <View style={styles.bankTitleRow}>
              <IconBank width={25} height={25} />
              <Text style={styles.bankTitle}>Ngân hàng của tôi</Text>
            </View>
            {hasBank ? (
              <IconEdit width={20} height={20} color={colors.forest} />
            ) : (
              <IconPlus width={22} height={22} />
            )}
          </View>
          {hasBank ? (
            <Text style={styles.bankSavedText}>
              {`${user?.bankName ?? 'Ngân hàng'} · ${maskBankAccount(user?.bankAccountNumber) ?? ''}\n${(user?.bankAccountHolder || user?.displayName || '').toUpperCase()}`}
            </Text>
          ) : (
            <Text style={styles.bankEmptyText}>
              Thêm tài khoản để bạn bè quét VietQR trả dễ hơn.
            </Text>
          )}
        </Pressable>

        <View style={styles.settingsCard}>
          <Pressable
            onPress={() => navigation.navigate('NotificationPreferences')}
            style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
          >
            <IconBell width={21} height={21} />
            <Text style={styles.menuLabel}>Thông báo & nhắc nhẹ</Text>
            <IconChevron width={18} height={18} />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            onPress={() => navigation.navigate('PhoneChange')}
            style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
          >
            <IconShield width={21} height={21} />
            <Text style={styles.menuLabel}>Quyền riêng tư & đổi SĐT</Text>
            <IconChevron width={18} height={18} />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            onPress={() => navigation.navigate('OfflineSaved', {})}
            style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
          >
            <IconOffline width={21} height={21} color={colors.ink} />
            <Text style={styles.menuLabel}>Đã lưu trên máy</Text>
            {offlineCount > 0 ? (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{offlineCount}</Text>
              </View>
            ) : null}
            <IconChevron width={18} height={18} />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            onPress={() => void handleShareApp()}
            style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
          >
            <IconShare width={21} height={21} color={colors.ink} />
            <Text style={styles.menuLabel}>Mời bạn dùng ChiaNè</Text>
            <IconChevron width={18} height={18} />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            onPress={() => setHelpOpen(true)}
            style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
          >
            <IconHelp width={21} height={21} color={colors.ink} />
            <Text style={styles.menuLabel}>Trợ giúp & góp ý</Text>
            <IconChevron width={18} height={18} />
          </Pressable>
        </View>

        <ChiaNeButton
          label="Đăng xuất"
          variant="quiet"
          onPress={() => setLogoutOpen(true)}
        />

        <View style={styles.footerWrap}>
          <Text style={styles.versionText}>ChiaNè 1.0.0</Text>
          <Text style={styles.taglineText}>
            Làm bằng sự tử tế, dành cho hội bạn.
          </Text>
        </View>
      </View>

      <Modal
        visible={editProfileOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditProfileOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={savingName ? undefined : () => setEditProfileOpen(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Chỉnh sửa hồ sơ</Text>
            <ChiaNeInput
              label="Tên hiển thị"
              value={nameInput}
              onChangeText={(t) => {
                setNameInput(t);
                if (nameError) setNameError(null);
              }}
              placeholder="Ví dụ: Nguyễn An"
              maxLength={60}
              errorText={nameError}
            />
            <View style={styles.modalActions}>
              <ChiaNeButton
                label="Lưu thay đổi"
                variant="primary"
                loading={savingName}
                onPress={() => void handleSaveName()}
              />
              <ChiaNeButton
                label="Đóng"
                variant="quiet"
                disabled={savingName}
                onPress={() => setEditProfileOpen(false)}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={helpOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setHelpOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setHelpOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Trợ giúp & Minh bạch</Text>
            <Text style={styles.helpBody}>
              {
                '• Mọi khoản chia đều làm tròn đến từng đồng (+1 ₫) để tổng luôn khớp 100%.\n• Mã VietQR chỉ được tạo từ số tài khoản bạn lưu.\n• Số dư nhóm chỉ cập nhật sau khi người nhận tiền bấm xác nhận.\n• Nếu mất mạng khi thêm khoản chi, ChiaNè tự động lưu trên máy để bạn không bị mất dữ liệu.'
              }
            </Text>
            <ChiaNeButton
              label="Đã hiểu"
              variant="primary"
              onPress={() => setHelpOpen(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmDialog
        visible={logoutOpen}
        title="Đăng xuất khỏi ChiaNè?"
        description="Bạn có thể đăng nhập lại bất kỳ lúc nào bằng số điện thoại để đồng bộ đầy đủ dữ liệu nhóm."
        confirmLabel="Đăng xuất"
        destructive
        loading={loggingOut}
        onConfirm={() => void handleConfirmLogout()}
        onCancel={() => setLogoutOpen(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 14,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 24,
    lineHeight: 35,
    color: colors.ink,
  },
  gearBtn: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  content: {
    gap: 16,
  },
  profileCard: {
    minHeight: 124,
    backgroundColor: colors.forest,
    borderRadius: radii.featureCard,
    padding: 20,
    gap: 6,
  },
  profileName: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: colors.white,
  },
  profilePhone: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.onForestMuted,
  },
  editProfileLink: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.lime,
    marginTop: 6,
  },
  bankCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: 18,
    gap: 10,
  },
  bankTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bankTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bankTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.ink,
  },
  bankSavedText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 18,
    color: colors.forest,
  },
  bankEmptyText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
  settingsCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    paddingHorizontal: 18,
  },
  menuRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  menuLabel: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.ink,
  },
  countBadge: {
    backgroundColor: colors.lime,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.forest,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
  },
  footerWrap: {
    alignItems: 'center',
    gap: 4,
    paddingTop: 4,
  },
  versionText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
  },
  taglineText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
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
  helpBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
  },
  modalActions: {
    gap: 10,
  },
});
