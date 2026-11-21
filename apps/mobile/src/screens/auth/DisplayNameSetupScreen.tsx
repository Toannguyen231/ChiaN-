import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  ChiaNeButton,
  ChiaNeInput,
  InfoCard,
  ScreenContainer,
} from '../../components';
import { ApiClientError } from '../../services/apiClient';
import { useAuthStore } from '../../store/authStore';
import { colors, fonts, typography } from '../../theme/tokens';

/**
 * Lightweight post-OTP onboarding step when a newly verified user does not yet have
 * a displayName configured so Dashboard greets them naturally ("Chào <Tên>,").
 */
export function DisplayNameSetupScreen() {
  const completeProfile = useAuthStore((s) => s.completeProfile);
  const skipProfileSetup = useAuthStore((s) => s.skipProfileSetup);
  const user = useAuthStore((s) => s.user);

  const [name, setName] = useState(user?.displayName ?? '');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const trimmed = name.trim();

  const handleSave = async () => {
    if (!trimmed) {
      setErrorText('Nhập tên để hội bạn dễ nhận ra bạn nhé.');
      return;
    }

    setLoading(true);
    setErrorText(null);
    try {
      await completeProfile(trimmed);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorText(err.message);
      } else {
        setErrorText('Không thể lưu tên lúc này. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      footer={
        <View style={styles.footerActions}>
          <ChiaNeButton
            label="Tiếp tục vào ChiaNè"
            variant={trimmed ? 'primary' : 'disabled'}
            disabled={!trimmed}
            loading={loading}
            onPress={handleSave}
          />
          <Pressable onPress={skipProfileSetup} style={styles.skipBtn}>
            <Text style={styles.skipText}>Để sau</Text>
          </Pressable>
        </View>
      }
      contentStyle={styles.content}
    >
      <StatusBar style="dark" />

      <Text style={styles.eyebrow}>CHÀO BẠN MỚI</Text>
      <Text style={styles.headline}>{'Hội bạn hay gọi\nbạn là gì nè?'}</Text>
      <Text style={styles.subtitle}>
        Tên này sẽ hiển thị khi bạn ghi khoản chi và thanh toán trong nhóm.
      </Text>

      <ChiaNeInput
        label="TÊN HIỂN THỊ"
        placeholder="Ví dụ: Nguyễn An"
        value={name}
        onChangeText={(value) => {
          setErrorText(null);
          setName(value);
        }}
        errorText={errorText}
        maxLength={60}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSave}
        containerStyle={styles.inputWrap}
      />

      <InfoCard tone="lavender">
        <Text style={styles.noteTitle}>Bạn có thể đổi lại bất cứ lúc nào</Text>
        <Text style={styles.noteBody}>
          Vào mục Tài khoản để cập nhật tên hoặc liên kết ngân hàng nhận tiền sau.
        </Text>
      </InfoCard>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 32,
  },
  eyebrow: {
    ...typography.micro,
    color: colors.muted,
    marginBottom: 10,
  },
  headline: {
    ...typography.heading,
    color: colors.forest,
    marginBottom: 12,
  },
  subtitle: {
    ...typography.body,
    color: colors.muted,
    marginBottom: 28,
  },
  inputWrap: {
    marginBottom: 24,
  },
  noteTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.purple,
    marginBottom: 4,
  },
  noteBody: {
    ...typography.caption,
    color: colors.purple,
  },
  footerActions: {
    gap: 10,
  },
  skipBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.muted,
  },
});
