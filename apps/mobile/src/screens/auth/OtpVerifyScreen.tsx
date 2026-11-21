import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { formatVnPhoneDisplay } from '@chiane/shared';
import IconShieldMuted from '../../../assets/figma/icon-shield-muted.svg';
import {
  AppHeader,
  ChiaNeButton,
  InfoCard,
  OtpInput,
  ScreenContainer,
} from '../../components';
import type { AuthStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { useAuthStore } from '../../store/authStore';
import { colors, fonts, typography } from '../../theme/tokens';

type Props = NativeStackScreenProps<AuthStackParamList, 'OtpVerify'>;

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mm = Math.floor(safe / 60)
    .toString()
    .padStart(2, '0');
  const ss = (safe % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

export function OtpVerifyScreen({ navigation, route }: Props) {
  const { phone } = route.params;
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const requestOtp = useAuthStore((s) => s.requestOtp);
  const otpExpiresInSeconds = useAuthStore((s) => s.otpExpiresInSeconds);
  const resendCooldownSeconds = useAuthStore((s) => s.resendCooldownSeconds);
  const devOtpHint = useAuthStore((s) => s.devOtpHint);

  const [code, setCode] = useState('');
  const [resendLeft, setResendLeft] = useState(resendCooldownSeconds);
  const [ttlLeft, setTtlLeft] = useState(otpExpiresInSeconds);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setResendLeft((prev) => (prev > 0 ? prev - 1 : 0));
      setTtlLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const isExpired = ttlLeft === 0;
  const canSubmit = code.length === 6 && !isExpired && !loading;

  const handleVerify = async () => {
    if (!canSubmit) {
      return;
    }

    setLoading(true);
    setErrorText(null);
    try {
      await verifyOtp(phone, code);
      // RootNavigator transitions automatically based on authStore status
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'OTP_EXPIRED') {
          setTtlLeft(0);
        }
        setErrorText(err.message);
      } else {
        setErrorText('Không thể xác thực mã OTP. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendLeft > 0 || resending) {
      return;
    }

    setResending(true);
    setErrorText(null);
    try {
      const response = await requestOtp(phone);
      setCode('');
      setResendLeft(response.resendCooldownSeconds);
      setTtlLeft(response.expiresInSeconds);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'OTP_COOLDOWN' && typeof err.details?.retryAfterSeconds === 'number') {
          setResendLeft(err.details.retryAfterSeconds);
        }
        setErrorText(err.message);
      } else {
        setErrorText('Không thể gửi lại mã. Vui lòng thử lại.');
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      header={
        <AppHeader
          title="Xác thực"
          onBack={() => navigation.goBack()}
        />
      }
      footer={
        <ChiaNeButton
          label="Xác nhận"
          variant={canSubmit ? 'primary' : 'disabled'}
          disabled={!canSubmit}
          loading={loading}
          onPress={handleVerify}
          testID="otp-verify-btn"
        />
      }
      contentStyle={styles.content}
    >
      <StatusBar style="dark" />

      <Text style={styles.headline}>Một bước nữa thôi.</Text>

      <Text style={styles.subtitle}>
        {`Nhập mã 6 số được gửi đến\n${formatVnPhoneDisplay(phone)}`}
      </Text>

      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={8}
        style={styles.changePhoneBtn}
      >
        <Text style={styles.changePhoneText}>Đổi số điện thoại</Text>
      </Pressable>

      <View style={styles.otpContainer}>
        <OtpInput
          value={code}
          onChange={(next) => {
            setErrorText(null);
            setCode(next);
          }}
          hasError={Boolean(errorText) || isExpired}
          disabled={isExpired}
        />
      </View>

      <View style={styles.resendRow}>
        {resendLeft > 0 ? (
          <Text style={styles.resendCountdown}>
            {`Chưa nhận được mã? Gửi lại sau ${formatCountdown(resendLeft)}`}
          </Text>
        ) : (
          <Pressable
            onPress={handleResend}
            disabled={resending}
            hitSlop={8}
            style={styles.resendTap}
          >
            <Text style={styles.resendLink}>
              {resending ? 'Đang gửi lại mã...' : 'Chưa nhận được mã? Gửi lại ngay'}
            </Text>
          </Pressable>
        )}
      </View>

      {isExpired ? (
        <InfoCard tone="peach" style={styles.alertCard}>
          <Text style={styles.alertTitle}>Mã xác thực đã hết hạn</Text>
          <Text style={styles.alertBody}>
            Mã có hiệu lực trong 5 phút. Hãy nhấn &quot;Gửi lại ngay&quot; để nhận mã mới nhé.
          </Text>
        </InfoCard>
      ) : null}

      {errorText && !isExpired ? (
        <InfoCard tone="peach" style={styles.alertCard}>
          <Text style={styles.alertBody}>{errorText}</Text>
        </InfoCard>
      ) : null}

      {__DEV__ && devOtpHint ? (
        <InfoCard tone="lime" style={styles.devCard}>
          <Text style={styles.devText}>
            {`[DEV MODE] Mã OTP thử nghiệm: ${devOtpHint}`}
          </Text>
        </InfoCard>
      ) : null}

      <InfoCard tone="white" style={styles.securityCard}>
        <View style={styles.securityRow}>
          <IconShieldMuted width={26} height={26} />
          <Text style={styles.securityText}>
            {'Giữ mã này cho riêng bạn nhé.\nChiaNè không bao giờ hỏi mã qua chat.'}
          </Text>
        </View>
      </InfoCard>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 14,
  },
  headline: {
    ...typography.screenHeading,
    color: colors.ink,
    marginBottom: 12,
  },
  subtitle: {
    ...typography.body,
    color: colors.muted,
    marginBottom: 12,
  },
  changePhoneBtn: {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
    marginBottom: 28,
  },
  changePhoneText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    lineHeight: 18,
    color: colors.forest,
  },
  otpContainer: {
    marginBottom: 22,
  },
  resendRow: {
    minHeight: 32,
    justifyContent: 'center',
    marginBottom: 20,
  },
  resendCountdown: {
    ...typography.label,
    color: colors.muted,
  },
  resendTap: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  resendLink: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    lineHeight: 18,
    color: colors.forest,
  },
  alertCard: {
    marginBottom: 16,
    paddingVertical: 14,
  },
  alertTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    lineHeight: 19,
    color: colors.coral,
    marginBottom: 4,
  },
  alertBody: {
    ...typography.label,
    color: colors.coral,
  },
  devCard: {
    marginBottom: 16,
    paddingVertical: 12,
  },
  devText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.forest,
  },
  securityCard: {
    marginTop: 12,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  securityText: {
    ...typography.caption,
    color: colors.muted,
    flex: 1,
  },
});
