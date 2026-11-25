import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatVnd, type GroupCategory, type GroupSummaryDto } from '@chiane/shared';
import IconChevron from '../../assets/figma/icon-chevron.svg';
import IconFood from '../../assets/figma/icon-food.svg';
import IconHome from '../../assets/figma/icon-home.svg';
import IconReceipt from '../../assets/figma/icon-receipt.svg';
import IconTrip from '../../assets/figma/icon-trip.svg';
import { colors, fonts, radii, shadows, tabularNums } from '../theme/tokens';
import { ScalePressable } from './motion/ScalePressable';

export const GROUP_CATEGORY_META: Record<
  GroupCategory,
  {
    label: string;
    badgeBg: string;
    Icon: React.FC<{ width?: number; height?: number }>;
  }
> = {
  TRAVEL: { label: 'Chuyến đi', badgeBg: colors.lavender, Icon: IconTrip },
  FOOD: { label: 'Ăn uống', badgeBg: colors.peach, Icon: IconFood },
  HOUSEHOLD: { label: 'Nhà chung', badgeBg: colors.lime, Icon: IconHome },
  OTHER: { label: 'Nhóm khác', badgeBg: colors.paper, Icon: IconReceipt },
};

export interface GroupCardProps {
  group: GroupSummaryDto;
  subtitleMode?: 'counts' | 'category';
  onPress: () => void;
}

export function GroupCard({
  group,
  subtitleMode = 'counts',
  onPress,
}: GroupCardProps) {
  const meta = GROUP_CATEGORY_META[group.category] ?? GROUP_CATEGORY_META.OTHER;
  const { Icon } = meta;

  const subtitle =
    subtitleMode === 'category'
      ? `${meta.label} · ${group.memberCount} thành viên`
      : `${group.memberCount} thành viên · ${group.expenseCount} khoản chi`;

  let balanceText = 'Đã cân bằng, vui nha!';
  let balanceColor: string = colors.forest;
  if (group.myBalanceVnd < 0) {
    balanceText = `Bạn cần trả ${formatVnd(Math.abs(group.myBalanceVnd))}`;
    balanceColor = colors.coral;
  } else if (group.myBalanceVnd > 0) {
    balanceText = `Bạn được nhận ${formatVnd(group.myBalanceVnd)}`;
    balanceColor = colors.forest;
  }

  return (
    <ScalePressable
      accessibilityRole="button"
      onPress={onPress}
      scaleTo={0.98}
      style={styles.card}
    >
      <View style={[styles.badge, { backgroundColor: meta.badgeBg }]}>
        <Icon width={24} height={24} />
      </View>
      <View style={styles.contentCol}>
        <Text style={styles.title} numberOfLines={1}>
          {group.name}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
        <Text style={[styles.balance, tabularNums, { color: balanceColor }]} numberOfLines={1}>
          {balanceText}
        </Text>
      </View>
      <IconChevron width={20} height={20} />
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 100,
    backgroundColor: colors.white,
    borderRadius: radii.featureCard,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    ...shadows.card,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  contentCol: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
  },
  balance: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
});
