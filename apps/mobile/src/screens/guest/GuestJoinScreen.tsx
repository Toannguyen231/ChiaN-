import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { InvitePreviewDto } from '@chiane/shared';
import IconShieldPurple from '../../../assets/figma/icon-shield-purple.svg';
import {
  AppHeader,
  ChiaNeButton,
  ChiaNeChip,
  ChiaNeInput,
  GROUP_CATEGORY_META,
  ScreenContainer,
  StateView,
} from '../../components';
import type { AppStackParamList, AuthStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { groupsApi } from '../../services/groupsApi';
import { invitesApi } from '../../services/invitesApi';
import { useAuthStore } from '../../store/authStore';
import { colors, fonts, radii } from '../../theme/tokens';

type Props =
  | NativeStackScreenProps<AppStackParamList, 'GuestJoin'>
  | NativeStackScreenProps<AuthStackParamList, 'GuestJoin'>;

export function GuestJoinScreen({ navigation, route }: Props) {
  const { inviteCode } = route.params;
  const authStatus = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const enterGuestSession = useAuthStore((s) => s.enterGuestSession);

  const isAuthenticatedUser =
    authStatus === 'authenticated' || authStatus === 'needs_profile';

  const [claimMemberId, setClaimMemberId] = useState<string>();
  const [preview, setPreview] = useState<InvitePreviewDto | null>(null);
  const guestGroupId = useAuthStore(s => s.guestSession?.groupId);
  const alreadyGuest = authStatus === 'guest' && !!preview && guestGroupId === preview.groupId;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const loadPreview = useCallback(async () => {
    setPreview(null);
    setLoading(true);
    setLoadError(null);
    try {
      const data = await invitesApi.getInvitePreview(inviteCode);
      setClaimMemberId(undefined);
      setPreview(data);
    } catch (err) {
      setLoadError(
        err instanceof ApiClientError
          ? err.message
          : 'Không tìm thấy nhóm với liên kết mời này.'
      );
    } finally {
      setLoading(false);
    }
  }, [inviteCode]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const handleJoin = async () => {
    if (!preview || preview.inviteCode !== inviteCode.trim().toLowerCase()) return;
    if (alreadyGuest) {
      (navigation as NativeStackScreenProps<AppStackParamList, 'GuestJoin'>['navigation']).replace('GroupDetails', { groupId: preview.groupId });
      return;
    }
    setSubmitError(null);
    setJoining(true);
    try {
      if (isAuthenticatedUser) {
        const res = await groupsApi.joinByInviteCode(preview.inviteCode, claimMemberId);
        (navigation as NativeStackScreenProps<AppStackParamList, 'GuestJoin'>['navigation']).replace(
          'GroupDetails',
          { groupId: res.groupId }
        );
      } else {
        const cleanName = displayName.trim();
        if (!cleanName && !claimMemberId) {
          setSubmitError('Vui lòng nhập tên hiển thị của bạn.');
          setJoining(false);
          return;
        }
        const session = await invitesApi.joinAsGuest(preview.inviteCode, cleanName || undefined, claimMemberId);
        await enterGuestSession(session);
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'MEMBER_ALREADY_CLAIMED') await loadPreview();
      setSubmitError(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể tham gia nhóm lúc này.'
      );
    } finally {
      setJoining(false);
    }
  };

  const categoryMeta = preview
    ? GROUP_CATEGORY_META[preview.category]
    : GROUP_CATEGORY_META.TRAVEL;
  const CategoryIcon = categoryMeta.Icon;

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      header={
        <AppHeader
          title="Bạn được mời nè"
          onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
        />
      }
      footer={
        preview && !loading && !loadError && (!preview.isArchived || alreadyGuest) ? (
          <ChiaNeButton
            label={alreadyGuest ? 'Mở nhóm' : isAuthenticatedUser ? 'Tham gia nhóm ngay' : 'Tham gia nhóm'}
            variant="primary"
            loading={joining}
            disabled={!alreadyGuest && !isAuthenticatedUser && !claimMemberId && !displayName.trim()}
            onPress={() => void handleJoin()}
          />
        ) : undefined
      }
    >
      {loading ? (
        <StateView kind="loading" title="Đang mở liên kết mời..." />
      ) : loadError || !preview ? (
        <StateView
          kind="error"
          title="Liên kết mời không hợp lệ"
          description={loadError ?? undefined}
          actionLabel="Thử lại"
          onAction={() => void loadPreview()}
        />
      ) : (
        <View style={styles.content}>
          <View style={styles.heroCard}>
            <CategoryIcon width={39} height={39} />
            <Text style={styles.heroTitle}>{preview.name}</Text>
            <Text style={styles.heroSub}>
              {`${preview.inviterName} mời bạn vào nhóm (${preview.memberCount} thành viên).\nCùng chia chi phí, cùng vui chuyến đi.`}
            </Text>
          </View>

          {!alreadyGuest && !preview.isArchived && Boolean(preview.claimableMembers?.length) && (
            <View style={styles.accountConfirmCard}>
              <Text style={styles.accountConfirmTitle}>Bạn đã có tên trong nhóm này chưa?</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {preview.claimableMembers.map(member => (
                  <ChiaNeChip key={member.id} label={member.displayName} active={claimMemberId === member.id}
                    onPress={() => setClaimMemberId(member.id)} />
                ))}
                <ChiaNeChip label="Tạo thành viên mới" active={!claimMemberId} onPress={() => setClaimMemberId(undefined)} />
              </View>
            </View>
          )}
          {alreadyGuest ? <Text style={styles.question}>Bạn đã tham gia nhóm này.</Text> : preview.isArchived ? (
            <StateView
              kind="empty"
              title="Nhóm này đã lưu trữ"
              description="Trưởng nhóm đã đóng sổ và lưu trữ nhóm này."
            />
          ) : isAuthenticatedUser ? (
            <View style={styles.accountConfirmCard}>
              <Text style={styles.accountConfirmTitle}>
                {`Tham gia với tài khoản ${user?.displayName?.trim() || user?.maskedPhone || ''}`}
              </Text>
              <Text style={styles.accountConfirmSub}>
                Bạn sẽ có đầy đủ quyền thành viên để ghi khoản chi, xem số dư tối ưu và xác nhận thanh toán.
              </Text>
              {submitError ? (
                <Text style={styles.errorText}>{submitError}</Text>
              ) : null}
            </View>
          ) : (
            <>
              <Text style={styles.question}>Bạn muốn được gọi là gì?</Text>
              <ChiaNeInput
                value={displayName}
                onChangeText={(t) => {
                  setDisplayName(t);
                  if (submitError) setSubmitError(null);
                }}
                placeholder="Tên hiển thị của bạn"
                maxLength={60}
                errorText={submitError}
              />

              <View style={styles.guestExplain}>
                <Text style={styles.guestExplainTitle}>
                  Chưa có tài khoản? Không sao cả.
                </Text>
                <Text style={styles.guestExplainBody}>
                  Bạn vẫn có thể xem và ghi khoản chi bằng liên kết này. Đăng ký sau bằng số điện thoại để lưu lịch sử dài lâu và nhận nhắc nhẹ.
                </Text>
              </View>

              <View style={styles.privacyCard}>
                <IconShieldPurple width={25} height={25} />
                <Text style={styles.privacyText}>
                  Chỉ thành viên trong nhóm mới xem được khoản chi và số dư của nhóm.
                </Text>
              </View>
            </>
          )}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 18,
  },
  heroCard: {
    minHeight: 196,
    backgroundColor: colors.lavender,
    borderRadius: radii.heroCard,
    padding: 20,
    justifyContent: 'space-between',
    gap: 10,
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: 25,
    lineHeight: 34,
    color: colors.purple,
    marginTop: 8,
  },
  heroSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.purple,
  },
  question: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: colors.ink,
    marginTop: 4,
    marginBottom: -4,
  },
  guestExplain: {
    gap: 6,
  },
  guestExplainTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.ink,
  },
  guestExplainBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
  },
  privacyCard: {
    backgroundColor: colors.lavender,
    borderRadius: radii.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  privacyText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 18,
    color: colors.purple,
  },
  accountConfirmCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: 18,
    gap: 8,
  },
  accountConfirmTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.ink,
  },
  accountConfirmSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.coral,
  },
});
