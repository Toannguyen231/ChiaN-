import React from 'react';
import { StyleSheet, Text, type ViewStyle } from 'react-native';
import { colors, fonts, radii } from '../theme/tokens';
import { ScalePressable } from './motion/ScalePressable';

export interface ChiaNeChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export function ChiaNeChip({
  label,
  active = false,
  onPress,
  style,
}: ChiaNeChipProps) {
  return (
    <ScalePressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected: active } : undefined}
      disabled={!onPress}
      onPress={onPress}
      scaleTo={0.96}
      style={[
        styles.chip,
        active ? styles.active : styles.inactive,
        style,
      ]}
    >
      <Text style={[styles.label, active ? styles.activeLabel : styles.inactiveLabel]}>
        {label}
      </Text>
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 34,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: radii.chip,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  active: {
    backgroundColor: colors.lime,
  },
  inactive: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  label: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    lineHeight: 17,
  },
  activeLabel: {
    color: colors.forest,
  },
  inactiveLabel: {
    color: colors.forest,
  },
});
