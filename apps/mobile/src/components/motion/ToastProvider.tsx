import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radii, shadows, sizes } from '../../theme/tokens';

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

export interface ToastPayload {
  message: string;
  tone?: ToastTone;
  durationMs?: number;
}

type ToastListener = (payload: ToastPayload) => void;

const listeners = new Set<ToastListener>();

/**
 * Imperatively display a floating toast banner from anywhere in the mobile app.
 */
export function showToast(payload: string | ToastPayload): void {
  const normalized: ToastPayload =
    typeof payload === 'string' ? { message: payload, tone: 'success' } : payload;
  listeners.forEach((fn) => fn(normalized));
}

const TONE_STYLES: Record<
  ToastTone,
  { bg: string; border: string; text: string; icon: string }
> = {
  success: {
    bg: colors.forest,
    border: colors.forest,
    text: colors.lime,
    icon: '✓',
  },
  info: {
    bg: colors.lavender,
    border: colors.purple,
    text: colors.purple,
    icon: '✦',
  },
  warning: {
    bg: colors.butter,
    border: colors.butterInk,
    text: colors.butterInk,
    icon: '!',
  },
  error: {
    bg: colors.peach,
    border: colors.coral,
    text: colors.coral,
    icon: '✕',
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<(ToastPayload & { id: number }) | null>(null);
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onShow: ToastListener = (payload) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      const id = Date.now();
      setToast({ ...payload, id });

      translateY.setValue(-48);
      opacity.setValue(0);

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 120,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();

      const duration = payload.durationMs ?? 2400;
      timerRef.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -36,
            duration: 190,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }),
        ]).start(({ finished }) => {
          if (finished) {
            setToast((prev) => (prev?.id === id ? null : prev));
          }
        });
      }, duration);
    };

    listeners.add(onShow);
    return () => {
      listeners.delete(onShow);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [opacity, translateY]);

  const toneMeta = TONE_STYLES[toast?.tone ?? 'success'];

  return (
    <View style={styles.flex}>
      {children}
      {toast ? (
        <View
          pointerEvents="none"
          style={[styles.overlay, { top: Math.max(insets.top + 8, 16) }]}
        >
          <Animated.View
            style={[
              styles.pill,
              {
                backgroundColor: toneMeta.bg,
                borderColor: toneMeta.border,
                opacity,
                transform: [{ translateY }],
              },
            ]}
          >
            <View style={[styles.iconDot, { borderColor: toneMeta.text }]}>
              <Text style={[styles.iconGlyph, { color: toneMeta.text }]}>
                {toneMeta.icon}
              </Text>
            </View>
            <Text style={[styles.message, { color: toneMeta.text }]} numberOfLines={2}>
              {toast.message}
            </Text>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 9999,
  },
  pill: {
    width: '100%',
    maxWidth: sizes.maxContentWidth - 32,
    borderRadius: radii.button,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...shadows.elevated,
  },
  iconDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: {
    fontFamily: fonts.bold,
    fontSize: 11,
    lineHeight: 14,
  },
  message: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 13,
    lineHeight: 18,
  },
});
