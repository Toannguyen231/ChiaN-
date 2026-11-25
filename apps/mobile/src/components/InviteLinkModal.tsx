import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { extractInviteCode } from '../services/invitesApi';
import { ChiaNeButton } from './ChiaNeButton';
import { ChiaNeInput } from './ChiaNeInput';
import { BottomSheetModal } from './motion/BottomSheetModal';

export interface InviteLinkModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmitCode: (inviteCode: string) => void;
}

/** Shared bottom sheet for pasting a group invite link or code and opening GuestJoin preview. */
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
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title="Tham gia nhóm qua liên kết"
      subtitle="Dán liên kết mời (ví dụ chiane.app/moi/dalat-26) hoặc nhập mã mời nhóm."
      footer={
        <View style={styles.actions}>
          <ChiaNeButton
            label="Xem lời mời"
            variant="primary"
            onPress={handleSubmit}
          />
          <ChiaNeButton label="Đóng" variant="quiet" onPress={onClose} />
        </View>
      }
    >
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
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 10,
  },
});
