import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radii } from '../theme/tokens';

export type InfoCardTone = 'white' | 'lavender' | 'lime' | 'peach' | 'forest';

export interface InfoCardProps {
  children: React.ReactNode;
  tone?: InfoCardTone;
  style?: ViewStyle;
}

const TONE_BG: Record<InfoCardTone, string> = {
  white: colors.white,
  lavender: colors.lavender,
  lime: colors.lime,
  peach: colors.peach,
  forest: colors.forest,
};

export function InfoCard({ children, tone = 'white', style }: InfoCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: TONE_BG[tone] }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
});
