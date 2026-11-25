import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ExpenseCategory } from '@chiane/shared';
import IconCoffee from '../../assets/figma/icon-coffee.svg';
import IconFood from '../../assets/figma/icon-food.svg';
import IconReceipt from '../../assets/figma/icon-receipt.svg';
import IconStay from '../../assets/figma/icon-expense-stay.svg';
import IconTransport from '../../assets/figma/icon-taxi.svg';
import { colors, fonts, radii, shadows, tabularNums } from '../theme/tokens';
import { ScalePressable } from './motion/ScalePressable';

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
    <ScalePressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      scaleTo={0.98}
      style={styles.row}
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
      <Text style={[styles.amount, tabularNums]}>{amountText}</Text>
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 74,
    backgroundColor: colors.white,
    borderRadius: radii.row,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...shadows.card,
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
