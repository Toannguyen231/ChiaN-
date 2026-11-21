import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, radii, typography } from '../theme/tokens';
import { ChiaNeButton } from './ChiaNeButton';

export interface StateViewProps {
  kind: 'loading' | 'empty' | 'error' | 'success';
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function StateView({
  kind,
  title,
  description,
  actionLabel,
  onAction,
}: StateViewProps) {
  const cardBg =
    kind === 'error'
      ? colors.peach
      : kind === 'success'
        ? colors.lime
        : colors.white;

  return (
    <View style={[styles.container, { backgroundColor: cardBg }]}>
      {kind === 'loading' ? (
        <ActivityIndicator size="large" color={colors.forest} style={styles.spinner} />
      ) : null}
      <Text style={[styles.title, kind === 'error' && styles.errorTitle]}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <View style={styles.actionWrap}>
          <ChiaNeButton label={actionLabel} onPress={onAction} variant="primary" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.featureCard,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  spinner: {
    marginBottom: 8,
  },
  title: {
    ...typography.title,
    color: colors.ink,
    textAlign: 'center',
  },
  errorTitle: {
    color: colors.coral,
  },
  description: {
    ...typography.body,
    color: colors.muted,
    textAlign: 'center',
  },
  actionWrap: {
    width: '100%',
    marginTop: 12,
  },
});
