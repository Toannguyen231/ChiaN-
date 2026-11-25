import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native';
import { colors, radii, shadows, sizes, typography } from '../theme/tokens';
import { ScalePressable } from './motion/ScalePressable';

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
    <ScalePressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      scaleTo={0.98}
      activeOpacity={0.93}
      style={containerStyle}
    >
      {loading ? (
        <ActivityIndicator size="small" color={indicatorColor} />
      ) : (
        <Text style={textStyle} numberOfLines={1}>
          {label}
        </Text>
      )}
    </ScalePressable>
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
    ...shadows.card,
  },
  secondary: {
    backgroundColor: colors.lime,
    ...shadows.card,
  },
  quiet: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  disabled: {
    backgroundColor: colors.line,
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
