import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, fonts } from '../../theme/tokens';

export interface SegmentedOption<T extends string> {
  key: T;
  label: string;
  badgeCount?: number;
}

export interface AnimatedSegmentedControlProps<T extends string> {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (next: T) => void;
  style?: StyleProp<ViewStyle>;
  variant?: 'lime' | 'forest';
}

const PADDING = 4;

/**
 * Smooth spring-sliding segmented tab bar powered by native-driver translateX.
 */
export function AnimatedSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
  variant = 'lime',
}: AnimatedSegmentedControlProps<T>) {
  const [containerWidth, setContainerWidth] = useState(0);
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.key === value)
  );
  const translateX = useRef(new Animated.Value(0)).current;
  const hasMeasuredRef = useRef(false);

  const segmentWidth =
    containerWidth > PADDING * 2 && options.length > 0
      ? (containerWidth - PADDING * 2) / options.length
      : 0;

  useEffect(() => {
    if (segmentWidth <= 0) return;
    const targetX = activeIndex * segmentWidth;
    if (!hasMeasuredRef.current) {
      translateX.setValue(targetX);
      hasMeasuredRef.current = true;
      return;
    }
    Animated.spring(translateX, {
      toValue: targetX,
      friction: 8,
      tension: 220,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, segmentWidth, translateX]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const nextWidth = e.nativeEvent.layout.width;
    if (Math.abs(nextWidth - containerWidth) > 1) {
      setContainerWidth(nextWidth);
    }
  };

  const isForest = variant === 'forest';

  return (
    <View
      onLayout={handleLayout}
      style={[styles.container, style]}
      accessibilityRole="tablist"
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            isForest ? styles.indicatorForest : styles.indicatorLime,
            {
              width: segmentWidth,
              transform: [{ translateX }],
            },
          ]}
        />
      ) : null}

      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.key)}
            style={styles.item}
          >
            <View style={styles.labelRow}>
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  active &&
                    (isForest ? styles.labelActiveForest : styles.labelActiveLime),
                ]}
              >
                {opt.label}
              </Text>
              {opt.badgeCount && opt.badgeCount > 0 ? (
                <View
                  style={[
                    styles.badge,
                    active && isForest && styles.badgeOnForest,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      active && isForest && styles.badgeTextOnForest,
                    ]}
                  >
                    {opt.badgeCount > 99 ? '99+' : opt.badgeCount}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 46,
    backgroundColor: colors.white,
    borderRadius: 23,
    padding: PADDING,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    left: PADDING,
    top: PADDING,
    bottom: PADDING,
    borderRadius: 19,
  },
  indicatorLime: {
    backgroundColor: colors.lime,
  },
  indicatorForest: {
    backgroundColor: colors.forest,
  },
  item: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
  },
  labelActiveLime: {
    fontFamily: fonts.semiBold,
    color: colors.forest,
  },
  labelActiveForest: {
    fontFamily: fonts.semiBold,
    color: colors.white,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOnForest: {
    backgroundColor: colors.lime,
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.white,
  },
  badgeTextOnForest: {
    color: colors.forest,
  },
});
