import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { GroupCategory } from '@chiane/shared';
import IconFood from '../../../assets/figma/icon-food.svg';
import IconHome from '../../../assets/figma/icon-home.svg';
import IconReceipt from '../../../assets/figma/icon-receipt.svg';
import IconTrip from '../../../assets/figma/icon-trip.svg';
import {
  AppHeader,
  AvatarBadge,
  ChiaNeButton,
  ChiaNeChip,
  ChiaNeInput,
  ScalePressable,
  ScreenContainer,
  showToast,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { groupsApi } from '../../services/groupsApi';
import { useGroupsStore } from '../../store/groupsStore';
import { colors, fonts, radii, shadows } from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'CreateGroup'>;

const PRIMARY_CATEGORIES: Array<{
  key: GroupCategory;
  label: string;
  Icon: React.FC<{ width?: number; height?: number }>;
}> = [
  { key: 'TRAVEL', label: 'Du lịch', Icon: IconTrip },
  { key: 'FOOD', label: 'Ăn uống', Icon: IconFood },
  { key: 'HOUSEHOLD', label: 'Nhà chung', Icon: IconHome },
];

export function CreateGroupScreen({ navigation, route }: Props) {
  const fetchGroupDetail = useGroupsStore((s) => s.fetchGroupDetail);
  const setGroupDetail = useGroupsStore((s) => s.setGroupDetail);

  const [name, setName] = useState(route.params?.initialName ?? '');
  const [category, setCategory] = useState<GroupCategory>(
    route.params?.initialCategory ?? 'TRAVEL'
  );
  const [memberDraft, setMemberDraft] = useState('');
  const [quickMembers, setQuickMembers] = useState<string[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleAddQuickMember = () => {
    const trimmed = memberDraft.trim();
    if (!trimmed) return;
    const exists = quickMembers.some(
      (m) => m.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      showToast({ message: `${trimmed} đã có trong danh sách rồi.`, tone: 'warning' });
      setMemberDraft('');
      return;
    }
    setQuickMembers((prev) => [...prev, trimmed]);
    setMemberDraft('');
  };

  const handleRemoveQuickMember = (target: string) => {
    setQuickMembers((prev) => prev.filter((m) => m !== target));
  };

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setErrorText('Vui lòng nhập tên nhóm trước nhé.');
      return;
    }

    const pendingMember = memberDraft.trim();
    const membersToAdd =
      pendingMember &&
      !quickMembers.some((m) => m.toLowerCase() === pendingMember.toLowerCase())
        ? [...quickMembers, pendingMember]
        : quickMembers;

    setSubmitting(true);
    setErrorText(null);
    try {
      const { group } = await groupsApi.createGroup({
        name: trimmed,
        category,
      });
      setGroupDetail(group);

      if (membersToAdd.length > 0) {
        await Promise.allSettled(
          membersToAdd.map((displayName) =>
            groupsApi.addMember(group.id, { displayName })
          )
        );
        await fetchGroupDetail(group.id).catch(() => {});
      }

      showToast('Đã tạo nhóm mới!');
      navigation.replace('GroupDetails', {
        groupId: group.id,
        justCreated: true,
      });
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể tạo nhóm lúc này. Vui lòng thử lại.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      header={
        <AppHeader title="Tạo nhóm mới" onBack={() => navigation.goBack()} />
      }
      footer={
        <ChiaNeButton
          label={
            quickMembers.length > 0
              ? `Tạo nhóm (${quickMembers.length + 1} người)`
              : 'Tạo nhóm'
          }
          variant="primary"
          loading={submitting}
          disabled={!name.trim()}
          onPress={() => void handleSubmit()}
        />
      }
    >
      <Text style={styles.heroHeading}>{'Một nhóm nhỏ,\nnhiều niềm vui.'}</Text>

      <ChiaNeInput
        label="Tên nhóm"
        value={name}
        onChangeText={(text) => {
          setName(text);
          if (errorText) setErrorText(null);
        }}
        placeholder="Đà Lạt cuối tuần"
        maxLength={80}
        autoFocus={!route.params?.initialName}
        errorText={errorText}
        containerStyle={styles.fieldGap}
      />

      <Text style={styles.sectionLabel}>Nhóm này dành cho...</Text>
      <View style={styles.categoryGrid}>
        {PRIMARY_CATEGORIES.map((item) => {
          const selected = category === item.key;
          const { Icon } = item;
          return (
            <ScalePressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setCategory(item.key)}
              scaleTo={0.96}
              style={[
                styles.categoryTile,
                selected && styles.categoryTileSelected,
              ]}
            >
              <Icon width={29} height={29} />
              <Text style={styles.categoryLabel}>{item.label}</Text>
            </ScalePressable>
          );
        })}
      </View>

      <View style={styles.otherWrap}>
        <ChiaNeChip
          label="Mục đích khác (sinh nhật, quỹ lớp...)"
          active={category === 'OTHER'}
          onPress={() => setCategory('OTHER')}
        />
        {category === 'OTHER' ? <IconReceipt width={18} height={18} /> : null}
      </View>

      {/* Quick Members Inline Section */}
      <View style={styles.quickMembersSection}>
        <View style={styles.quickMembersHeader}>
          <Text style={styles.sectionLabelNoMargin}>
            Thêm nhanh bạn bè (không bắt buộc)
          </Text>
          <View style={styles.currencyBadge}>
            <Text style={styles.currencyBadgeText}>VND (₫)</Text>
          </View>
        </View>
        <Text style={styles.quickMembersHint}>
          Nhập tên từng người để chia tiền được ngay, hoặc gửi link mời bạn sau.
        </Text>

        <View style={styles.quickInputRow}>
          <TextInput
            value={memberDraft}
            onChangeText={setMemberDraft}
            placeholder="Ví dụ: Minh, Thảo..."
            placeholderTextColor={colors.muted}
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={handleAddQuickMember}
            style={styles.quickInput}
          />
          <ScalePressable
            accessibilityRole="button"
            disabled={!memberDraft.trim()}
            onPress={handleAddQuickMember}
            scaleTo={0.95}
            style={[
              styles.addQuickBtn,
              !memberDraft.trim() && styles.addQuickBtnDisabled,
            ]}
          >
            <Text
              style={[
                styles.addQuickBtnText,
                !memberDraft.trim() && styles.addQuickBtnTextDisabled,
              ]}
            >
              + Thêm
            </Text>
          </ScalePressable>
        </View>

        {quickMembers.length > 0 ? (
          <View style={styles.memberChipsWrap}>
            {quickMembers.map((memberName) => (
              <Pressable
                key={memberName}
                accessibilityRole="button"
                accessibilityLabel={`Xóa ${memberName}`}
                onPress={() => handleRemoveQuickMember(memberName)}
                style={({ pressed }) => [
                  styles.memberChip,
                  pressed && styles.pressed,
                ]}
              >
                <AvatarBadge name={memberName} size={22} />
                <Text style={styles.memberChipName}>{memberName}</Text>
                <Text style={styles.memberChipRemove}>✕</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <Text style={styles.helperText}>
        Thành viên được mời sau vẫn có thể xem nhóm qua liên kết mà không cần tạo tài khoản trước.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heroHeading: {
    fontFamily: fonts.bold,
    fontSize: 28,
    lineHeight: 39,
    color: colors.forest,
    marginTop: 6,
    marginBottom: 20,
  },
  fieldGap: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
    marginBottom: 12,
  },
  sectionLabelNoMargin: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
    flex: 1,
  },
  categoryGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  categoryTile: {
    flex: 1,
    height: 102,
    backgroundColor: colors.white,
    borderRadius: radii.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.card,
  },
  categoryTileSelected: {
    backgroundColor: colors.lavender,
    borderColor: colors.purple,
    borderWidth: 1.5,
  },
  categoryLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.ink,
    textAlign: 'center',
  },
  otherWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    marginBottom: 22,
  },
  quickMembersSection: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 10,
    marginBottom: 18,
    ...shadows.card,
  },
  quickMembersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  currencyBadge: {
    backgroundColor: colors.sage,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  currencyBadgeText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.forest,
  },
  quickMembersHint: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
    marginTop: -4,
  },
  quickInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickInput: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.ink,
  },
  addQuickBtn: {
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addQuickBtnDisabled: {
    backgroundColor: colors.line,
  },
  addQuickBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.lime,
  },
  addQuickBtnTextDisabled: {
    color: colors.muted,
  },
  memberChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 2,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.paper,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 5,
    paddingLeft: 6,
    paddingRight: 10,
  },
  memberChipName: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.ink,
  },
  memberChipRemove: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.muted,
    marginLeft: 2,
  },
  pressed: {
    opacity: 0.75,
  },
  helperText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
  },
});
