import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, sizes, spacing } from '../theme/tokens';

export interface ScreenContainerProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
  header?: React.ReactNode;
  backgroundColor?: string;
  scrollable?: boolean;
  edges?: Edge[];
  contentStyle?: ViewStyle;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}

export function ScreenContainer({
  children,
  footer,
  header,
  backgroundColor = colors.paper,
  scrollable = true,
  edges = ['top', 'bottom'],
  contentStyle,
  refreshControl,
}: ScreenContainerProps) {
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={edges}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.responsiveCenter}>
          {header}
          {scrollable ? (
            <ScrollView
              style={styles.flex}
              contentContainerStyle={[styles.scrollContent, contentStyle]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.scrollContent, styles.flex, contentStyle]}>
              {children}
            </View>
          )}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  responsiveCenter: {
    flex: 1,
    width: '100%',
    maxWidth: sizes.maxContentWidth,
    alignSelf: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.screenPaddingX,
    paddingBottom: spacing.lg,
  },
  footer: {
    paddingHorizontal: spacing.screenPaddingX,
    paddingTop: 12,
    paddingBottom: 16,
  },
});
