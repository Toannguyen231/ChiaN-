import React, { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { formatVnd } from '@chiane/shared';
import { tabularNums } from '../../theme/tokens';

export interface AnimatedNumberProps extends Omit<TextProps, 'children' | 'style'> {
  value: number;
  durationMs?: number;
  formatter?: (val: number) => string;
  style?: StyleProp<TextStyle>;
}

/**
 * Smoothly interpolates VND amounts with ease-out cubic motion and tabular numerals.
 */
export function AnimatedNumber({
  value,
  durationMs = 450,
  formatter = (v) => formatVnd(v),
  style,
  ...rest
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState<number>(0);
  const currentRef = useRef<number>(0);

  useEffect(() => {
    const from = currentRef.current;
    const to = value;

    if (from === to || durationMs <= 0) {
      currentRef.current = to;
      setDisplayValue(to);
      return;
    }

    let rafId = 0;
    const startTime = Date.now();

    const step = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (to - from) * eased);
      currentRef.current = next;
      setDisplayValue(next);

      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        currentRef.current = to;
        setDisplayValue(to);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [durationMs, value]);

  return (
    <Text {...rest} style={[tabularNums, style]}>
      {formatter(displayValue)}
    </Text>
  );
}
