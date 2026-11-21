import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ExpenseCategory } from '@chiane/shared';
import IconCoffee from '../../assets/figma/icon-coffee.svg';
import IconFood from '../../assets/figma/icon-food.svg';
import IconReceipt from '../../assets/figma/icon-receipt.svg';
import IconStay from '../../assets/figma/icon-expense-stay.svg';
import IconTransport from '../../assets/figma/icon-taxi.svg';
import { colors, fonts, radii } from '../theme/tokens';

export interface ExpenseRowProps {
  title: string;
  subtitle: string;
  amountText: string;
  category: ExpenseCategory;
  onPress?: () => void;
}

const CATEGORY_META: Record<
  ExpenseCategory,
  { badgeColor: string; Icon: React.FC<{ width?: number; height?: number }> }
> = {
  FOOD: { badgeColor: colors.peach, Icon: IconFood },
  STAY: { badgeColor: colors.lavender, Icon: IconStay },
  TRANSPORT: { badgeColor: colors.lime, Icon: IconTransport },
  COFFEE: { badgeColor: colors.peach, Icon: IconCoffee },
  OTHER: { badgeColor: colors.paper, Icon: IconReceipt },
};

export function ExpenseRow({
  title,
  subtitle,
  amountText,
  category,
  onPress,
}: ExpenseRowProps) {
  const { badgeColor, Icon } = CATEGORY_META[category] ?? CATEGORY_META.OTHER;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && onPress && styles.pressed]}
    >
      <View style={[styles.badge, { backgroundColor: badgeColor }]}>
        <Icon width={20} height={20} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Text style={styles.amount}>{amountText}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 76,
    backgroundColor: colors.white,
    borderRadius: radii.row,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pressed: {
    opacity: 0.9,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radii.iconBadge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
  },
  amount: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    lineHeight: 18,
    color: colors.ink,
  },
});
