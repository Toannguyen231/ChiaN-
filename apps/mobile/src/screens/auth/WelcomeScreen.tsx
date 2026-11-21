import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import IconCheckDark from '../../../assets/figma/icon-check-dark.svg';
import IconFoodDark from '../../../assets/figma/icon-food-dark.svg';
import {
  ChiaNeButton,
  FriendshipMark,
  InviteLinkModal,
  ScreenContainer,
} from '../../components';
import type { AuthStackParamList } from '../../navigation/types';
import { colors, fonts, radii, typography } from '../../theme/tokens';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

export function WelcomeScreen({ navigation }: Props) {
  const [inviteModalVisible, setInviteModalVisible] = useState(false);

  return (
    <ScreenContainer
      backgroundColor={colors.forest}
      footer={
        <View style={styles.footerStack}>
          <ChiaNeButton
            label="Bắt đầu thôi"
            variant="secondary"
            onPress={() => navigation.navigate('Login')}
            testID="welcome-start-btn"
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => setInviteModalVisible(true)}
            style={({ pressed }) => [styles.inviteLinkBtn, pressed && styles.pressed]}
          >
            <Text style={styles.inviteLinkText}>Có liên kết mời từ bạn bè?</Text>
          </Pressable>
        </View>
      }
      contentStyle={styles.content}
    >
      <StatusBar style="light" />

      <View style={styles.brandHeader}>
        <Text style={styles.brandName}>ChiaNè</Text>
      </View>

      <View style={styles.markSection}>
        <FriendshipMark size={132} />
      </View>

      <Text style={styles.headline}>{'Chia tiền gọn,\ntình bạn vui.'}</Text>

      <Text style={styles.subtitle}>
        {'Bữa ăn chung, chuyến đi xa.\nChia mọi khoản, giữ trọn niềm vui.'}
      </Text>

      <View style={styles.previewCard}>
        <View style={styles.previewIcon}>
          <IconFoodDark width={28} height={28} />
        </View>
        <View style={styles.previewTextCol}>
          <Text style={styles.previewTitle}>Bún bò hội bạn</Text>
          <Text style={styles.previewAmount}>{'240.000 ₫  /  4 người'}</Text>
        </View>
        <View style={styles.previewCheck}>
          <IconCheckDark width={24} height={24} />
        </View>
      </View>

      <Text style={styles.taglineNote}>
        Ghi nhanh 10 giây • Minh bạch từng đồng
      </Text>

      <InviteLinkModal
        visible={inviteModalVisible}
        onClose={() => setInviteModalVisible(false)}
        onSubmitCode={(inviteCode) => {
          setInviteModalVisible(false);
          navigation.navigate('GuestJoin', { inviteCode });
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 12,
  },
  brandHeader: {
    height: 48,
    justifyContent: 'center',
  },
  brandName: {
    fontFamily: fonts.extraBold,
    fontSize: 25,
    lineHeight: 36,
    color: colors.lime,
  },
  markSection: {
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 34,
  },
  headline: {
    ...typography.heroDisplay,
    color: colors.white,
    marginBottom: 16,
  },
  subtitle: {
    ...typography.bodyLarge,
    color: colors.onForestMuted,
    marginBottom: 32,
  },
  previewCard: {
    height: 93,
    backgroundColor: colors.lime,
    borderRadius: radii.featureCard,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  previewIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTextCol: {
    flex: 1,
    gap: 4,
  },
  previewTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  previewAmount: {
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  previewCheck: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taglineNote: {
    fontFamily: fonts.medium,
    fontSize: 11,
    lineHeight: 16,
    color: colors.lime,
    marginTop: 20,
  },
  footerStack: {
    gap: 10,
  },
  inviteLinkBtn: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteLinkText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.lime,
  },
  pressed: {
    opacity: 0.75,
  },
});
