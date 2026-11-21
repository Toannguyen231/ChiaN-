import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native';
import { colors, radii, sizes, typography } from '../theme/tokens';

export type ChiaNeButtonVariant = 'primary' | 'secondary' | 'quiet' | 'disabled';

export interface ChiaNeButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ChiaNeButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  testID?: string;
}

export function ChiaNeButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  testID,
}: ChiaNeButtonProps) {
  const effectiveVariant: ChiaNeButtonVariant = disabled ? 'disabled' : variant;
  const isDisabled = effectiveVariant === 'disabled' || loading;

  const containerStyle = [
    styles.base,
    effectiveVariant === 'primary' && styles.primary,
    effectiveVariant === 'secondary' && styles.secondary,
    effectiveVariant === 'quiet' && styles.quiet,
    effectiveVariant === 'disabled' && styles.disabled,
    style,
  ];

  const textStyle = [
    styles.label,
    effectiveVariant === 'primary' && styles.primaryLabel,
    (effectiveVariant === 'secondary' || effectiveVariant === 'quiet') && styles.darkLabel,
    effectiveVariant === 'disabled' && styles.disabledLabel,
  ];

  const indicatorColor =
    effectiveVariant === 'primary' ? colors.white : colors.forest;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        ...containerStyle,
        pressed && !isDisabled ? styles.pressed : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={indicatorColor} />
      ) : (
        <Text style={textStyle} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: sizes.buttonHeight,
    minHeight: sizes.minTouchTarget,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    width: '100%',
  },
  primary: {
    backgroundColor: colors.forest,
  },
  secondary: {
    backgroundColor: colors.lime,
  },
  quiet: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  disabled: {
    backgroundColor: colors.line,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  label: {
    ...typography.button,
  },
  primaryLabel: {
    color: colors.white,
  },
  darkLabel: {
    color: colors.forest,
  },
  disabledLabel: {
    color: colors.muted,
  },
});
