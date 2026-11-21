import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  formatVnSubscriberInput,
  normalizeVnPhone,
} from '@chiane/shared';
import IconShieldPurple from '../../../assets/figma/icon-shield-purple.svg';
import {
  AppHeader,
  ChiaNeButton,
  ChiaNeChip,
  ChiaNeInput,
  InfoCard,
  InviteLinkModal,
  ScreenContainer,
} from '../../components';
import type { AuthStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { useAuthStore } from '../../store/authStore';
import { colors, fonts, typography } from '../../theme/tokens';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const requestOtp = useAuthStore((s) => s.requestOtp);
  const [phoneInput, setPhoneInput] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);

  const normalized = normalizeVnPhone(phoneInput);

  const handleChangePhone = (text: string) => {
    setErrorText(null);
    setPhoneInput(formatVnSubscriberInput(text));
  };

  const handleRequestOtp = async () => {
    if (!normalized) {
      setErrorText('Số điện thoại Việt Nam chưa đúng (ví dụ 912 345 678).');
      return;
    }

    setLoading(true);
    setErrorText(null);
    try {
      const response = await requestOtp(normalized);
      navigation.navigate('OtpVerify', { phone: response.phone });
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'OTP_COOLDOWN') {
          // If cooldown is active for the same phone, allow moving straight to OTP screen
          navigation.navigate('OtpVerify', { phone: normalized });
          return;
        }
        setErrorText(err.message);
      } else {
        setErrorText('Không thể gửi mã xác thực. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      header={
        <AppHeader
          title="Đăng nhập"
          onBack={() => navigation.goBack()}
        />
      }
      footer={
        <ChiaNeButton
          label="Nhận mã xác thực"
          variant={normalized ? 'primary' : 'disabled'}
          disabled={!normalized}
          loading={loading}
          onPress={handleRequestOtp}
          testID="login-request-otp-btn"
        />
      }
      contentStyle={styles.content}
    >
      <StatusBar style="dark" />

      <Text style={styles.headline}>{'Hội bạn đang\nchờ bạn đó.'}</Text>

      <Text style={styles.subtitle}>
        {'Nhập số điện thoại để bắt đầu.\nKhông mật khẩu, không phiền phức.'}
      </Text>

      <View style={styles.fieldGroup}>
        <ChiaNeInput
          label="SỐ ĐIỆN THOẠI"
          prefixText="+84"
          placeholder="912 345 678"
          value={phoneInput}
          onChangeText={handleChangePhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          maxLength={14}
          errorText={errorText}
          returnKeyType="done"
          onSubmitEditing={handleRequestOtp}
        />

        <View style={styles.countryChipWrap}>
          <ChiaNeChip label="Việt Nam" />
        </View>
      </View>

      <InfoCard tone="lavender" style={styles.privacyCard}>
        <View style={styles.privacyRow}>
          <IconShieldPurple width={24} height={24} />
          <View style={styles.privacyTextCol}>
            <Text style={styles.privacyTitle}>Chỉ để kết nối bạn bè</Text>
            <Text style={styles.privacyBody}>
              {
                'Số của bạn không hiển thị công khai\nvà không dùng cho quảng cáo.'
              }
            </Text>
          </View>
        </View>
      </InfoCard>

      <Text style={styles.termsText}>
        {
          'Tiếp tục nghĩa là bạn đồng ý với\nĐiều khoản sử dụng và Chính sách riêng tư.'
        }
      </Text>

      <Pressable
        accessibilityRole="button"
        onPress={() => setInviteModalVisible(true)}
        style={({ pressed }) => [styles.inviteLinkBtn, pressed && styles.pressed]}
      >
        <Text style={styles.inviteLinkText}>Có liên kết mời từ bạn bè?</Text>
      </Pressable>

      <InviteLinkModal
        visible={inviteModalVisible}
        onClose={() => setInviteModalVisible(false)}
        onSubmitCode={(inviteCode) => {
          setInviteModalVisible(false);
          navigation.navigate('GuestJoin', { inviteCode });
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 12,
  },
  headline: {
    ...typography.heading,
    color: colors.forest,
    marginBottom: 14,
  },
  subtitle: {
    ...typography.body,
    color: colors.muted,
    marginBottom: 28,
  },
  fieldGroup: {
    marginBottom: 28,
  },
  countryChipWrap: {
    marginTop: 14,
  },
  privacyCard: {
    marginBottom: 28,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  privacyTextCol: {
    flex: 1,
    gap: 4,
  },
  privacyTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    lineHeight: 19,
    color: colors.purple,
  },
  privacyBody: {
    ...typography.caption,
    color: colors.purple,
  },
  termsText: {
    ...typography.caption,
    color: colors.muted,
  },
  inviteLinkBtn: {
    marginTop: 18,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteLinkText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.purple,
  },
  pressed: {
    opacity: 0.75,
  },
});
