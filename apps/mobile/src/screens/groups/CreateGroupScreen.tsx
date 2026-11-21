import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { GroupCategory } from '@chiane/shared';
import IconFood from '../../../assets/figma/icon-food.svg';
import IconHome from '../../../assets/figma/icon-home.svg';
import IconReceipt from '../../../assets/figma/icon-receipt.svg';
import IconTrip from '../../../assets/figma/icon-trip.svg';
import {
  AppHeader,
  ChiaNeButton,
  ChiaNeChip,
  ChiaNeInput,
  ScreenContainer,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { groupsApi } from '../../services/groupsApi';
import { useGroupsStore } from '../../store/groupsStore';
import { colors, fonts, radii } from '../../theme/tokens';

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

export function CreateGroupScreen({ navigation }: Props) {
  const setGroupDetail = useGroupsStore((s) => s.setGroupDetail);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<GroupCategory>('TRAVEL');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setErrorText('Vui lòng nhập tên nhóm trước nhé.');
      return;
    }

    setSubmitting(true);
    setErrorText(null);
    try {
      const { group } = await groupsApi.createGroup({
        name: trimmed,
        category,
      });
      setGroupDetail(group);
      navigation.replace('InviteFriends', { groupId: group.id, fromCreate: true });
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
          label="Tạo nhóm"
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
        autoFocus
        errorText={errorText}
        containerStyle={styles.fieldGap}
      />

      <Text style={styles.sectionLabel}>Nhóm này dành cho...</Text>
      <View style={styles.categoryGrid}>
        {PRIMARY_CATEGORIES.map((item) => {
          const selected = category === item.key;
          const { Icon } = item;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setCategory(item.key)}
              style={[
                styles.categoryTile,
                selected && styles.categoryTileSelected,
              ]}
            >
              <Icon width={29} height={29} />
              <Text style={styles.categoryLabel}>{item.label}</Text>
            </Pressable>
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

      <Text style={styles.fieldLabel}>Đơn vị tiền tệ</Text>
      <View style={styles.readonlyInput}>
        <Text style={styles.readonlyText}>VND · Việt Nam Đồng</Text>
      </View>

      <Text style={styles.helperText}>
        {
          'Bạn có thể mời bạn bè ngay sau khi tạo nhóm.\nThành viên được mời không cần có tài khoản trước.'
        }
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heroHeading: {
    fontFamily: fonts.bold,
    fontSize: 29,
    lineHeight: 42,
    color: colors.forest,
    marginTop: 8,
    marginBottom: 24,
  },
  fieldGap: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
    marginBottom: 14,
  },
  categoryGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  categoryTile: {
    flex: 1,
    height: 107,
    backgroundColor: colors.white,
    borderRadius: radii.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  categoryTileSelected: {
    backgroundColor: colors.lavender,
    borderColor: colors.purple,
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
    marginBottom: 24,
  },
  fieldLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    lineHeight: 17,
    color: colors.ink,
    marginBottom: 10,
  },
  readonlyInput: {
    height: 60,
    backgroundColor: colors.white,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    justifyContent: 'center',
    marginBottom: 22,
  },
  readonlyText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
  },
  helperText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
  },
});
