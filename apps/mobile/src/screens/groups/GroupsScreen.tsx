import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  type CompositeNavigationProp,
} from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import IconArrow from '../../../assets/figma/icon-arrow.svg';
import IconPlus from '../../../assets/figma/icon-plus.svg';
import IconSearch from '../../../assets/figma/icon-search.svg';
import {
  AnimatedSegmentedControl,
  CardListSkeleton,
  FadeSlideIn,
  GroupCard,
  InviteLinkModal,
  ScalePressable,
  ScreenContainer,
  StateView,
} from '../../components';
import type { AppStackParamList, MainTabParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { extractInviteCode } from '../../services/invitesApi';
import { useGroupsStore } from '../../store/groupsStore';
import { colors, fonts, radii, shadows, sizes } from '../../theme/tokens';

export { extractInviteCode };

type GroupsNav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'GroupsTab'>,
  NativeStackNavigationProp<AppStackParamList>
>;

type GroupsTabMode = 'ACTIVE' | 'ARCHIVED';

export function GroupsScreen() {
  const navigation = useNavigation<GroupsNav>();
  const activeGroups = useGroupsStore((s) => s.activeGroups);
  const archivedGroups = useGroupsStore((s) => s.archivedGroups);
  const fetchGroups = useGroupsStore((s) => s.fetchGroups);

  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [groups, setGroups] = useState(activeGroups);
  const [loading, setLoading] = useState(activeGroups.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [joinModalVisible, setJoinModalVisible] = useState(false);

  const loadGroups = useCallback(
    async (archivedFlag: boolean, search: string, isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else if (
        (!archivedFlag && activeGroups.length === 0) ||
        (archivedFlag && archivedGroups.length === 0)
      ) {
        setLoading(true);
      }
      setErrorText(null);
      try {
        const fetched = await fetchGroups(archivedFlag, search);
        setGroups(fetched);
      } catch (err) {
        setErrorText(
          err instanceof ApiClientError
            ? err.message
            : 'Không thể tải danh sách nhóm.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeGroups.length, archivedGroups.length, fetchGroups]
  );

  useFocusEffect(
    useCallback(() => {
      void loadGroups(showArchived, searchQuery, false);
    }, [loadGroups, showArchived, searchQuery])
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadGroups(showArchived, searchQuery, false);
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery, showArchived, loadGroups]);

  const handleSwitchArchived = (archivedFlag: boolean) => {
    setShowArchived(archivedFlag);
    if (!searchQuery.trim()) {
      setGroups(archivedFlag ? archivedGroups : activeGroups);
    }
  };

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      edges={['top']}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadGroups(showArchived, searchQuery, true)}
          tintColor={colors.forest}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Nhóm của bạn</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tạo nhóm mới"
          hitSlop={8}
          onPress={() => navigation.navigate('CreateGroup')}
          style={({ pressed }) => [styles.plusBtn, pressed && styles.pressed]}
        >
          <IconPlus width={24} height={24} />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <IconSearch width={20} height={20} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Tìm tên nhóm..."
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          returnKeyType="search"
        />
      </View>

      <View style={styles.filterWrap}>
        <AnimatedSegmentedControl<GroupsTabMode>
          options={[
            { key: 'ACTIVE', label: 'Đang hoạt động' },
            { key: 'ARCHIVED', label: 'Đã lưu trữ' },
          ]}
          value={showArchived ? 'ARCHIVED' : 'ACTIVE'}
          onChange={(next) => handleSwitchArchived(next === 'ARCHIVED')}
        />
      </View>

      {loading ? (
        <View style={styles.stateWrap}>
          <CardListSkeleton count={3} cardHeight={100} />
        </View>
      ) : errorText ? (
        <View style={styles.stateWrap}>
          <StateView
            kind="error"
            title="Không tải được nhóm"
            description={errorText}
            actionLabel="Thử lại"
            onAction={() => void loadGroups(showArchived, searchQuery, false)}
          />
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.stateWrap}>
          <StateView
            kind="empty"
            title={
              searchQuery.trim()
                ? 'Không tìm thấy nhóm phù hợp'
                : showArchived
                  ? 'Chưa có nhóm đã lưu trữ'
                  : 'Bạn chưa tham gia nhóm nào'
            }
            description={
              showArchived
                ? 'Các nhóm đã chốt sổ và lưu trữ sẽ hiển thị tại đây.'
                : 'Tạo nhóm mới hoặc dán liên kết mời từ bạn bè để cùng chia tiền.'
            }
            actionLabel={!showArchived && !searchQuery.trim() ? 'Tạo nhóm mới' : undefined}
            onAction={
              !showArchived && !searchQuery.trim()
                ? () => navigation.navigate('CreateGroup')
                : undefined
            }
          />
        </View>
      ) : (
        <View style={styles.list}>
          {groups.map((group, idx) => (
            <FadeSlideIn key={group.id} index={idx}>
              <GroupCard
                group={group}
                subtitleMode="category"
                onPress={() =>
                  navigation.navigate('GroupDetails', { groupId: group.id })
                }
              />
            </FadeSlideIn>
          ))}
        </View>
      )}

      <ScalePressable
        accessibilityRole="button"
        onPress={() => {
          setJoinModalVisible(true);
        }}
        scaleTo={0.98}
        style={styles.inviteCard}
      >
        <View style={styles.inviteTextCol}>
          <Text style={styles.inviteTitle}>Có lời mời từ hội bạn?</Text>
          <Text style={styles.inviteSub}>Dán liên kết để tham gia nhóm</Text>
        </View>
        <IconArrow width={24} height={24} />
      </ScalePressable>

      <InviteLinkModal
        visible={joinModalVisible}
        onClose={() => setJoinModalVisible(false)}
        onSubmitCode={(inviteCode) => {
          setJoinModalVisible(false);
          navigation.navigate('GuestJoin', { inviteCode });
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 14,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 24,
    lineHeight: 35,
    color: colors.ink,
  },
  plusBtn: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
  searchWrap: {
    height: 50,
    backgroundColor: colors.white,
    borderRadius: radii.input,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.ink,
    height: '100%',
  },
  filterWrap: {
    marginTop: 14,
    marginBottom: 16,
  },
  stateWrap: {
    marginBottom: 20,
  },
  list: {
    gap: 12,
    marginBottom: 20,
  },
  inviteCard: {
    minHeight: 94,
    backgroundColor: colors.lavender,
    borderRadius: radii.featureCard,
    borderWidth: 1,
    borderColor: 'rgba(110, 85, 165, 0.16)',
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
    ...shadows.card,
  },
  inviteTextCol: {
    flex: 1,
    gap: 6,
  },
  inviteTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    lineHeight: 22,
    color: colors.purple,
  },
  inviteSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.purple,
  },
});
