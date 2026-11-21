import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii, typography } from '../theme/tokens';
import { ChiaNeButton } from './ChiaNeButton';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  children?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Để sau',
  destructive = false,
  loading = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={loading ? undefined : onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.title, destructive && styles.destructiveTitle]}>
            {title}
          </Text>
          <Text style={styles.description}>{description}</Text>
          {children}
          <View style={styles.actions}>
            <ChiaNeButton
              label={confirmLabel}
              variant="primary"
              loading={loading}
              onPress={onConfirm}
              style={destructive ? styles.destructiveBtn : undefined}
            />
            <ChiaNeButton
              label={cancelLabel}
              variant="quiet"
              disabled={loading}
              onPress={onCancel}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(23, 62, 50, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.white,
    borderRadius: radii.heroCard,
    padding: 24,
    gap: 12,
  },
  title: {
    ...typography.title,
    color: colors.ink,
  },
  destructiveTitle: {
    color: colors.coral,
  },
  description: {
    ...typography.body,
    color: colors.muted,
  },
  actions: {
    gap: 10,
    marginTop: 8,
  },
  destructiveBtn: {
    backgroundColor: colors.coral,
  },
});
