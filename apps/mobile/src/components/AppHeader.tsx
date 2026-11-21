import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import IconBack from '../../assets/figma/icon-back.svg';
import { colors, sizes, spacing, typography } from '../theme/tokens';

export interface AppHeaderProps {
  title: string;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
}

export function AppHeader({ title, onBack, rightSlot }: AppHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.leftRow}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={onBack}
            hitSlop={8}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <IconBack width={24} height={24} />
          </Pressable>
        ) : null}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 60,
    paddingHorizontal: spacing.screenPaddingX,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.paper,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  backButton: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    marginLeft: -12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  pressed: {
    opacity: 0.6,
  },
  title: {
    ...typography.headerTitle,
    color: colors.ink,
    flexShrink: 1,
  },
  rightSlot: {
    minWidth: sizes.minTouchTarget,
    minHeight: sizes.minTouchTarget,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
