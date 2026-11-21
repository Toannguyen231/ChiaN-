import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { extractInviteCode } from '../services/invitesApi';
import { colors, radii, typography } from '../theme/tokens';
import { ChiaNeButton } from './ChiaNeButton';
import { ChiaNeInput } from './ChiaNeInput';

export interface InviteLinkModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmitCode: (inviteCode: string) => void;
}

/** Shared modal for pasting a group invite link or code and opening GuestJoin preview. */
export function InviteLinkModal({
  visible,
  onClose,
  onSubmitCode,
}: InviteLinkModalProps) {
  const [inviteInput, setInviteInput] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setInviteInput('');
      setErrorText(null);
    }
  }, [visible]);

  const handleSubmit = () => {
    const code = extractInviteCode(inviteInput);
    if (!code) {
      setErrorText('Vui lòng dán liên kết hoặc mã mời nhóm.');
      return;
    }
    setInviteInput('');
    setErrorText(null);
    onSubmitCode(code);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Tham gia nhóm qua liên kết</Text>
          <Text style={styles.desc}>
            Dán liên kết mời (ví dụ chiane.app/moi/dalat-26) hoặc nhập mã mời nhóm.
          </Text>
          <ChiaNeInput
            value={inviteInput}
            onChangeText={(text) => {
              setInviteInput(text);
              if (errorText) setErrorText(null);
            }}
            placeholder="chiane.app/moi/..."
            autoCapitalize="none"
            autoCorrect={false}
            errorText={errorText}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
          <View style={styles.actions}>
            <ChiaNeButton
              label="Xem lời mời"
              variant="primary"
              onPress={handleSubmit}
            />
            <ChiaNeButton label="Đóng" variant="quiet" onPress={onClose} />
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
    padding: 22,
    gap: 12,
  },
  title: {
    ...typography.title,
    color: colors.ink,
  },
  desc: {
    ...typography.body,
    color: colors.muted,
  },
  actions: {
    gap: 10,
    marginTop: 4,
  },
});
