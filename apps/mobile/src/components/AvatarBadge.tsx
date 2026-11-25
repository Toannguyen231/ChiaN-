import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fonts } from '../theme/tokens';

const PASTEL_PALETTES: Array<{ bg: string; fg: string }> = [
  { bg: colors.lime, fg: colors.forest },
  { bg: colors.lavender, fg: colors.purple },
  { bg: colors.peach, fg: colors.coral },
  { bg: colors.sage, fg: colors.forest },
  { bg: colors.butter, fg: colors.butterInk },
];

export function extractInitials(name?: string | null): string {
  const cleaned = (name ?? '').trim();
  if (!cleaned) return 'B';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  const first = parts[0]![0] ?? '';
  const last = parts[parts.length - 1]![0] ?? '';
  return `${first}${last}`.toUpperCase();
}

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export interface AvatarBadgeProps {
  name?: string | null;
  size?: number;
  highlight?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Deterministic pastel initials avatar matching the ChiaNè Design System.
 */
export function AvatarBadge({
  name,
  size = 38,
  highlight = false,
  style,
}: AvatarBadgeProps) {
  const safeName = (name ?? '').trim() || 'Bạn';
  const palette = PASTEL_PALETTES[hashName(safeName) % PASTEL_PALETTES.length]!;
  const fontSize = Math.max(11, Math.round(size * 0.36));

  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: highlight ? colors.forest : palette.bg,
          borderWidth: highlight ? 2 : 1,
          borderColor: highlight ? colors.lime : 'rgba(23, 62, 50, 0.08)',
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.initials,
          {
            fontSize,
            color: highlight ? colors.lime : palette.fg,
          },
        ]}
        numberOfLines={1}
      >
        {extractInitials(safeName)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: fonts.bold,
    letterSpacing: -0.2,
  },
});
