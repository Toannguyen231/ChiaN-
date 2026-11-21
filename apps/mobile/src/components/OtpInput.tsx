import React, { useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radii, typography } from '../theme/tokens';

export interface OtpInputProps {
  value: string;
  onChange: (nextCode: string) => void;
  hasError?: boolean;
  disabled?: boolean;
  length?: number;
}

export function OtpInput({
  value,
  onChange,
  hasError = false,
  disabled = false,
  length = 6,
}: OtpInputProps) {
  const hiddenInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const sanitized = value.replace(/\D/g, '').slice(0, length);

  const focusInput = () => {
    if (!disabled) {
      hiddenInputRef.current?.focus();
    }
  };

  return (
    <View style={styles.wrapper}>
      <TextInput
        ref={hiddenInputRef}
        value={sanitized}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        editable={!disabled}
        caretHidden
        accessibilityLabel="Nhập mã xác thực 6 chữ số"
        style={styles.hiddenInput}
      />
      <Pressable
        onPress={focusInput}
        style={styles.boxesRow}
        accessibilityRole="button"
        accessibilityLabel="Ô nhập mã OTP 6 chữ số"
      >
        {Array.from({ length }).map((_, index) => {
          const digit = sanitized[index] ?? '';
          const isActive =
            !disabled &&
            (index === sanitized.length ||
              (sanitized.length === length && index === length - 1));

          return (
            <View
              key={index}
              style={[
                styles.box,
                isActive && styles.boxActive,
                hasError && styles.boxError,
                disabled && styles.boxDisabled,
              ]}
            >
              <Text style={styles.digitText}>{digit}</Text>
            </View>
          );
        })}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    width: '100%',
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0.01,
  },
  boxesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
  },
  box: {
    flex: 1,
    maxWidth: 50,
    height: 62,
    borderRadius: radii.otpBox,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: {
    borderColor: colors.forest,
    borderWidth: 1.5,
  },
  boxError: {
    borderColor: colors.coral,
    borderWidth: 1.5,
  },
  boxDisabled: {
    backgroundColor: colors.paper,
    opacity: 0.7,
  },
  digitText: {
    ...typography.otpDigit,
    color: colors.ink,
    textAlign: 'center',
  },
});
