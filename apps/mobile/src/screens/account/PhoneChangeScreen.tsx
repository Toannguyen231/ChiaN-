import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  formatVnPhoneDisplay,
  formatVnSubscriberInput,
  normalizeVnPhone,
} from '@chiane/shared';
import {
  AppHeader,
  ChiaNeButton,
  ChiaNeInput,
  InfoCard,
  OtpInput,
  ScreenContainer,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { authApi } from '../../services/authApi';
import { useAuthStore } from '../../store/authStore';
import { colors, fonts, typography } from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'PhoneChange'>;

export function PhoneChangeScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const applyPhoneChangeResult = useAuthStore((s) => s.applyPhoneChangeResult);

  const [step, setStep] = useState<'PHONE' | 'OTP' | 'DONE'>('PHONE');
  const [phoneInput, setPhoneInput] = useState('');
  const [targetE164, setTargetE164] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const normalized = normalizeVnPhone(phoneInput);

  const handleRequestOtp = async () => {
    if (!normalized) {
      setErrorText('Số điện thoại Việt Nam chưa hợp lệ.');
      return;
    }
    setLoading(true);
    setErrorText(null);
    try {
      const res = await authApi.requestPhoneChange(normalized);
      setTargetE164(res.phone);
      setDevOtp(res.devOtp ?? null);
      setCode('');
      setStep('OTP');
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể gửi mã xác thực tới số mới.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    setErrorText(null);
    try {
      const res = await authApi.verifyPhoneChange(targetE164, code);
      await applyPhoneChangeResult(res);
      setStep('DONE');
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Mã xác thực chưa chính xác hoặc đã hết hạn.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      header={
        <AppHeader
          title="Đổi số điện thoại"
          onBack={() =>
            step === 'OTP' ? setStep('PHONE') : navigation.goBack()
          }
        />
      }
      footer={
        step === 'PHONE' ? (
          <ChiaNeButton
            label="Gửi mã xác thực tới số mới"
            variant="primary"
            disabled={!normalized}
            loading={loading}
            onPress={() => void handleRequestOtp()}
          />
        ) : step === 'OTP' ? (
          <ChiaNeButton
            label="Xác nhận đổi số điện thoại"
            variant="primary"
            disabled={code.length !== 6}
            loading={loading}
            onPress={() => void handleVerify()}
          />
        ) : (
          <ChiaNeButton
            label="Quay lại tài khoản"
            variant="primary"
            onPress={() => navigation.goBack()}
          />
        )
      }
    >
      {step === 'PHONE' ? (
        <View style={styles.content}>
          <Text style={styles.heading}>Cập nhật số mới an toàn.</Text>
          <Text style={styles.subtitle}>
            {`Số hiện tại: ${user?.maskedPhone ?? ''}. Toàn bộ nhóm và lịch sử giao dịch của bạn vẫn giữ nguyên sau khi đổi số.`}
          </Text>

          <ChiaNeInput
            label="SỐ ĐIỆN THOẠI MỚI"
            prefixText="+84"
            value={phoneInput}
            onChangeText={(t) => {
              setPhoneInput(formatVnSubscriberInput(t));
              if (errorText) setErrorText(null);
            }}
            placeholder="912 345 678"
            keyboardType="phone-pad"
            maxLength={14}
            errorText={errorText}
          />

          <InfoCard tone="lavender">
            <Text style={styles.noteText}>
              Sau khi xác thực thành công, phiên đăng nhập trên các thiết bị cũ sẽ tự động đăng xuất để bảo vệ tài khoản của bạn.
            </Text>
          </InfoCard>
        </View>
      ) : step === 'OTP' ? (
        <View style={styles.content}>
          <Text style={styles.heading}>Nhập mã xác thực 6 số.</Text>
          <Text style={styles.subtitle}>
            {`Đã gửi mã xác nhận tới ${formatVnPhoneDisplay(targetE164)}`}
          </Text>

          <OtpInput
            value={code}
            onChange={(next) => {
              setCode(next);
              if (errorText) setErrorText(null);
            }}
            hasError={Boolean(errorText)}
          />

          {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

          {devOtp ? (
            <InfoCard tone="lime">
              <Text style={styles.devOtpText}>{`Mã OTP thử nghiệm: ${devOtp}`}</Text>
            </InfoCard>
          ) : null}
        </View>
      ) : (
        <View style={styles.content}>
          <InfoCard tone="lime">
            <Text style={styles.doneTitle}>Đã đổi số điện thoại thành công!</Text>
            <Text style={styles.doneSub}>
              {`Tài khoản ChiaNè của bạn hiện liên kết với ${user?.maskedPhone ?? ''}.`}
            </Text>
          </InfoCard>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 18,
    paddingTop: 8,
  },
  heading: {
    ...typography.heading,
    color: colors.forest,
  },
  subtitle: {
    ...typography.body,
    color: colors.muted,
  },
  noteText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.purple,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.coral,
  },
  devOtpText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.forest,
  },
  doneTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.forest,
    marginBottom: 6,
  },
  doneSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.ink,
  },
});
