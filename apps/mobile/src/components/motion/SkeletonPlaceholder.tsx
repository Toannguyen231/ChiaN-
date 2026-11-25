import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radii } from '../../theme/tokens';

export interface SkeletonPlaceholderProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonPlaceholder({
  width = '100%',
  height = 16,
  borderRadius = 10,
  style,
}: SkeletonPlaceholderProps) {
  const opacity = useRef(new Animated.Value(0.42)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.42,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.bone,
        {
          width,
          height,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function DashboardSkeleton() {
  return (
    <View style={styles.stack}>
      <SkeletonPlaceholder height={196} borderRadius={radii.heroCard} style={styles.heroBone} />
      <View style={styles.quickRow}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.quickCell}>
            <SkeletonPlaceholder width={52} height={52} borderRadius={16} />
            <SkeletonPlaceholder width="72%" height={11} borderRadius={6} />
          </View>
        ))}
      </View>
      <SkeletonPlaceholder width={130} height={20} borderRadius={8} style={styles.sectionBone} />
      <SkeletonPlaceholder height={96} borderRadius={radii.featureCard} />
      <SkeletonPlaceholder height={96} borderRadius={radii.featureCard} />
    </View>
  );
}

export function CardListSkeleton({
  count = 3,
  cardHeight = 90,
}: {
  count?: number;
  cardHeight?: number;
}) {
  return (
    <View style={styles.stack}>
      {Array.from({ length: count }).map((_, idx) => (
        <SkeletonPlaceholder
          key={idx}
          height={cardHeight}
          borderRadius={radii.card}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bone: {
    backgroundColor: colors.line,
  },
  heroBone: {
    backgroundColor: '#D6E0D5',
  },
  stack: {
    gap: 14,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  quickCell: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  sectionBone: {
    marginTop: 6,
  },
});
