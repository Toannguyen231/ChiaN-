import React, { useEffect, useRef } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

export interface FadeSlideInProps {
  children: React.ReactNode;
  index?: number;
  delayMs?: number;
  staggerMs?: number;
  durationMs?: number;
  offsetY?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Staggered entrance animation (opacity + subtle translateY) powered by native driver.
 */
export function FadeSlideIn({
  children,
  index = 0,
  delayMs,
  staggerMs = 45,
  durationMs = 320,
  offsetY = 14,
  style,
}: FadeSlideInProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(offsetY)).current;

  useEffect(() => {
    const computedDelay = delayMs ?? Math.min(index, 8) * staggerMs;
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: durationMs,
        delay: computedDelay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: durationMs,
        delay: computedDelay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [delayMs, durationMs, index, opacity, staggerMs, translateY]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
