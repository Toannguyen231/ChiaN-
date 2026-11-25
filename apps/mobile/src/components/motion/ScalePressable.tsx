import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface ScalePressableProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  activeOpacity?: number;
}

/**
 * Spring-animated pressable primitive using native driver for crisp 60fps tactile feedback.
 */
export function ScalePressable({
  children,
  style,
  scaleTo = 0.97,
  activeOpacity = 0.92,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: ScalePressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const handlePressIn = (e: GestureResponderEvent) => {
    if (!disabled) {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: scaleTo,
          friction: 7,
          tension: 280,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: activeOpacity,
          duration: 90,
          useNativeDriver: true,
        }),
      ]).start();
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 240,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 130,
        useNativeDriver: true,
      }),
    ]).start();
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        style,
        {
          opacity,
          transform: [{ scale }],
        },
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}
