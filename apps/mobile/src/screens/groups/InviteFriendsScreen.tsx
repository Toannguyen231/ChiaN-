import React, { useCallback, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import IconCopy from '../../../assets/figma/icon-copy.svg';
import IconLink from '../../../assets/figma/icon-link.svg';
import {
  AppHeader,
  ChiaNeButton,
  GROUP_CATEGORY_META,
  ScreenContainer,
  StateView,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { groupsApi } from '../../services/groupsApi';
import { useGroupsStore } from '../../store/groupsStore';
import { colors, fonts, radii } from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'InviteFriends'>;

export function InviteFriendsScreen({ navigation, route }: Props) {
  const { groupId, fromCreate } = route.params;
  const cachedGroup = useGroupsStore((s) => s.groupDetailsById[groupId]);
  const fetchGroupDetail = useGroupsStore((s) => s.fetchGroupDetail);
  const setGroupDetail = useGroupsStore((s) => s.setGroupDetail);

  const [group, setGroup] = useState(cachedGroup ?? null);
  const [loading, setLoading] = useState(!cachedGroup);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [copiedZaloNotice, setCopiedZaloNotice] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const getZaloInviteMessage = () => {
    if (!group) return '';
    return `👋 Ê mọi người ơi, mình lập nhóm "${group.name}" trên ChiaNè để chia tiền ăn chơi/du lịch cho rõ ràng, không lo tính nhầm!\n👉 Bấm vào liên kết này vào nhóm cùng mình nhé:\n${group.inviteLink}`;
  };

  const handleCopyZaloMessage = async () => {
    if (!group) return;
    await Clipboard.setStringAsync(getZaloInviteMessage());
    setCopiedZaloNotice(true);
    setTimeout(() => setCopiedZaloNotice(false), 2500);
  };

  const loadGroup = useCallback(async () => {
    if (!cachedGroup) setLoading(true);
    setErrorText(null);
    try {
      const detail = await fetchGroupDetail(groupId);
      setGroup(detail);
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể tải thông tin mời nhóm.'
      );
    } finally {
      setLoading(false);
    }
  }, [cachedGroup, fetchGroupDetail, groupId]);

  useFocusEffect(
    useCallback(() => {
      void loadGroup();
    }, [loadGroup])
  );

  const handleCopy = async () => {
    if (!group) return;
    await Clipboard.setStringAsync(group.inviteLink);
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 2500);
  };

  const handleRegenerate = async () => {
    if (!group || regenerating) return;
    setRegenerating(true);
    try {
      const res = await groupsApi.regenerateInviteLink(group.id);
      const next = {
        ...group,
        inviteCode: res.inviteCode,
        inviteLink: res.inviteLink,
      };
      setGroup(next);
      setGroupDetail(next);
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể tạo liên kết mới.'
      );
    } finally {
      setRegenerating(false);
    }
  };

  const handleShare = async () => {
    if (!group) return;
    await Share.share({
      message: getZaloInviteMessage(),
      url: group.inviteLink,
    });
  };

  const meta = group ? GROUP_CATEGORY_META[group.category] : GROUP_CATEGORY_META.TRAVEL;
  const CategoryIcon = meta.Icon;

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      header={
        <AppHeader title="Mời hội bạn vào" onBack={() => navigation.goBack()} />
      }
      footer={
        group ? (
          <View style={styles.footerStack}>
            <ChiaNeButton
              label="Chia sẻ liên kết mời"
              variant="primary"
              onPress={() => void handleShare()}
            />
            {fromCreate ? (
              <ChiaNeButton
                label="Vào chi tiết nhóm"
                variant="quiet"
                onPress={() => navigation.replace('GroupDetails', { groupId: group.id })}
              />
            ) : null}
          </View>
        ) : undefined
      }
    >
      {loading && !group ? (
        <StateView kind="loading" title="Đang tải liên kết mời..." />
      ) : errorText && !group ? (
        <StateView
          kind="error"
          title="Không tải được lời mời"
          description={errorText}
          actionLabel="Thử lại"
          onAction={() => void loadGroup()}
        />
      ) : group ? (
        <View style={styles.content}>
          <View style={styles.heroCard}>
            <CategoryIcon width={35} height={35} />
            <Text style={styles.heroTitle}>{group.name}</Text>
            <Text style={styles.heroSubtitle}>Đủ hội, chuyến đi mới vui.</Text>
          </View>

          <Text style={styles.sectionTitle}>Một liên kết, cả hội cùng vào.</Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => void handleCopy()}
            style={({ pressed }) => [styles.linkBox, pressed && styles.pressed]}
          >
            <IconLink width={23} height={23} />
            <Text style={styles.linkText} numberOfLines={1}>
              {group.inviteLink.replace(/^https?:\/\//, '')}
            </Text>
            <IconCopy width={21} height={21} />
          </Pressable>

          <View style={styles.linkActionsRow}>
            <Pressable onPress={() => void handleCopy()} hitSlop={8}>
              <Text style={styles.linkActionText}>
                {copiedNotice ? 'Đã sao chép liên kết!' : 'Sao chép liên kết'}
              </Text>
            </Pressable>
            {group.myRole === 'ADMIN' && !group.isArchived ? (
              <Pressable
                onPress={() => void handleRegenerate()}
                disabled={regenerating}
                hitSlop={8}
              >
                <Text style={styles.regenText}>
                  {regenerating ? 'Đang tạo mã...' : 'Tạo liên kết mới'}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.zaloCard}>
            <View style={styles.zaloHeader}>
              <Text style={styles.zaloTitle}>💬 Mẫu tin nhắn gửi Zalo / Messenger</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void handleCopyZaloMessage()}
                hitSlop={8}
                style={styles.zaloCopyBtn}
              >
                <IconCopy width={14} height={14} />
                <Text style={styles.zaloCopyText}>
                  {copiedZaloNotice ? 'Đã sao chép!' : 'Sao chép'}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.zaloPreviewText} numberOfLines={4}>
              {getZaloInviteMessage()}
            </Text>
          </View>

          <Text style={styles.membersHeading}>THÀNH VIÊN · {group.memberCount}</Text>

          <View style={styles.membersCard}>
            {group.members.map((member, index) => (
              <React.Fragment key={member.id}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <View style={styles.memberRow}>
                  <Text style={styles.memberName}>
                    {member.displayName}
                    {member.isMe ? ' (bạn)' : ''}
                  </Text>
                  <Text style={styles.memberRole}>
                    {member.role === 'ADMIN'
                      ? 'Trưởng nhóm'
                      : member.role === 'GUEST'
                        ? 'Khách'
                        : 'Đã tham gia'}
                  </Text>
                </View>
              </React.Fragment>
            ))}
          </View>

          <Text style={styles.caption}>
            Ai có liên kết đều có thể yêu cầu tham gia.
          </Text>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
  },
  heroCard: {
    minHeight: 158,
    backgroundColor: colors.lavender,
    borderRadius: radii.heroCard,
    padding: 20,
    justifyContent: 'space-between',
    gap: 8,
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 32,
    color: colors.purple,
    marginTop: 8,
  },
  heroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.purple,
  },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 17,
    lineHeight: 25,
    color: colors.ink,
    marginTop: 10,
  },
  linkBox: {
    height: 62,
    backgroundColor: colors.white,
    borderRadius: radii.row,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pressed: {
    opacity: 0.85,
  },
  linkText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.ink,
  },
  linkActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  zaloCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  zaloHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  zaloTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.ink,
  },
  zaloCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.lavender,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  zaloCopyText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.purple,
  },
  zaloPreviewText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
    backgroundColor: colors.paper,
    padding: 10,
    borderRadius: 8,
  },
  linkActionText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.forest,
  },
  regenText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.purple,
  },
  membersHeading: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.muted,
    marginTop: 12,
  },
  membersCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  memberRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memberName: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.ink,
  },
  memberRole: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
  },
  caption: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
  },
  footerStack: {
    gap: 10,
  },
});
