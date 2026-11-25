import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, sizes, typography } from '../../theme/tokens';

export interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  dismissable?: boolean;
  scrollable?: boolean;
  sheetStyle?: StyleProp<ViewStyle>;
}

/**
 * Smooth spring bottom-sheet modal with backdrop fade, handle bar, and keyboard handling.
 */
export function BottomSheetModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  dismissable = true,
  scrollable = false,
  sheetStyle,
}: BottomSheetModalProps) {
  const insets = useSafeAreaInsets();
  const [rendered, setRendered] = useState(visible);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(320)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 210,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          friction: 9,
          tension: 95,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (rendered) {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 160,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 320,
          duration: 170,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setRendered(false);
        }
      });
    }
  }, [backdropOpacity, rendered, translateY, visible]);

  if (!rendered) {
    return null;
  }

  return (
    <Modal
      visible={rendered}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismissable ? onClose : undefined}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismissable ? onClose : undefined}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 18) },
            sheetStyle,
            { transform: [{ translateY }] },
          ]}
        >
          <View style={styles.handleWrap}>
            <View style={styles.handleBar} />
          </View>

          {title ? (
            <View style={styles.headerBlock}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
          ) : null}

          {scrollable ? (
            <ScrollView
              style={styles.scrollBody}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={styles.body}>{children}</View>
          )}

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(23, 62, 50, 0.45)',
  },
  sheet: {
    width: '100%',
    maxWidth: sizes.maxContentWidth,
    maxHeight: '86%',
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  handleWrap: {
    alignItems: 'center',
    paddingBottom: 12,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
  },
  headerBlock: {
    gap: 4,
    marginBottom: 14,
  },
  title: {
    ...typography.title,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  body: {
    gap: 12,
  },
  scrollBody: {
    flexGrow: 0,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 6,
  },
  footer: {
    marginTop: 14,
    gap: 10,
  },
});
