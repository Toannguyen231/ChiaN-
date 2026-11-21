import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { formatVnd } from '@chiane/shared';
import {
  AppHeader,
  ChiaNeButton,
  IconClock,
  IconOffline,
  IconTrash,
  InfoCard,
  ScreenContainer,
  StateView,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { useOfflineQueueStore } from '../../store/offlineQueueStore';
import { colors, fonts, radii } from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'OfflineSaved'>;

export function OfflineSavedScreen({ navigation, route }: Props) {
  const { groupId } = route.params ?? {};
  const items = useOfflineQueueStore((s) => s.items);
  const syncing = useOfflineQueueStore((s) => s.syncing);
  const hydrate = useOfflineQueueStore((s) => s.hydrate);
  const syncAll = useOfflineQueueStore((s) => s.syncAll);
  const removeItem = useOfflineQueueStore((s) => s.removeItem);

  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const handleSyncNow = async () => {
    setStatusNote(null);
    setErrorText(null);
    try {
      const res = await syncAll();
      if (res.remainingCount === 0) {
        setStatusNote(
          res.syncedCount > 0
            ? `Đã đồng bộ thành công ${res.syncedCount} khoản chi lên nhóm!`
            : 'Mọi khoản chi đều đã được đồng bộ.'
        );
      } else {
        setErrorText(
          `Đã đồng bộ ${res.syncedCount} khoản, còn ${res.remainingCount} khoản chờ kiểm tra lại.`
        );
      }
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError && err.code === 'NETWORK_ERROR'
          ? 'Chưa thể kết nối máy chủ. Khoản chi vẫn an toàn trên máy của bạn.'
          : 'Không thể đồng bộ lúc này. Vui lòng thử lại sau.'
      );
    }
  };

  const handleBackToGroup = () => {
    if (groupId) {
      navigation.navigate('GroupDetails', { groupId });
    } else {
      navigation.goBack();
    }
  };

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      header={
        <AppHeader title="Đã lưu trên máy" onBack={() => navigation.goBack()} />
      }
      footer={
        <View style={styles.footerStack}>
          {items.length > 0 ? (
            <ChiaNeButton
              label="Thử đồng bộ ngay"
              variant="secondary"
              loading={syncing}
              onPress={() => void handleSyncNow()}
            />
          ) : null}
          <ChiaNeButton
            label={groupId ? 'Về nhóm' : 'Quay lại'}
            variant="primary"
            onPress={handleBackToGroup}
          />
        </View>
      }
    >
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <IconOffline width={50} height={50} color={colors.purple} />
        </View>

        <Text style={styles.title}>
          {items.length > 0
            ? 'Mất mạng,\nkhông mất khoản chi.'
            : 'Mọi khoản chi\nđã lên nhóm.'}
        </Text>
        <Text style={styles.subtitle}>
          {items.length > 0
            ? `${items[0]!.payload.title} đã được lưu trên máy.\nHệ thống sẽ tự đồng bộ khi có mạng trở lại.`
            : 'Hiện không còn khoản chi nào nằm trong hàng đợi ngoại tuyến.'}
        </Text>

        {statusNote ? (
          <InfoCard tone="lime" style={styles.fullWidth}>
            <Text style={styles.statusOkText}>{statusNote}</Text>
          </InfoCard>
        ) : null}

        {errorText ? (
          <InfoCard tone="peach" style={styles.fullWidth}>
            <Text style={styles.errorText}>{errorText}</Text>
          </InfoCard>
        ) : null}

        {items.length === 0 ? (
          <View style={styles.fullWidth}>
            <StateView
              kind="success"
              title="Hàng đợi trống"
              description="Khi nào bạn ghi khoản chi lúc mất mạng, chúng sẽ nằm an toàn tại đây."
            />
          </View>
        ) : (
          <View style={styles.list}>
            {items.map((item) => (
              <View key={item.clientMutationId} style={styles.queueCard}>
                <View style={styles.queueTop}>
                  <View style={styles.queueTextCol}>
                    <Text style={styles.queueTitle}>{item.payload.title}</Text>
                    <Text style={styles.queueGroup}>{item.groupName}</Text>
                    <Text style={styles.queueAmount}>
                      {formatVnd(item.payload.amountVnd)}
                    </Text>
                  </View>
                  <View style={styles.queueStatusCol}>
                    <IconClock width={22} height={22} color={colors.purple} />
                    <Text style={styles.queueStatusText}>Chờ đồng bộ</Text>
                  </View>
                </View>

                {item.lastError ? (
                  <View style={styles.itemErrorRow}>
                    <Text style={styles.itemErrorText}>{item.lastError}</Text>
                    <Pressable
                      hitSlop={8}
                      onPress={() => void removeItem(item.clientMutationId)}
                    >
                      <IconTrash width={18} height={18} color={colors.coral} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}

            <View style={styles.visibilityBanner}>
              <Text style={styles.visibilityText}>
                {
                  'Chưa hiển thị với thành viên khác.\nBạn không cần gửi lại khoản chi này.'
                }
              </Text>
            </View>
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    paddingTop: 18,
    gap: 14,
  },
  fullWidth: {
    width: '100%',
  },
  iconCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 25,
    lineHeight: 34,
    color: colors.ink,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    textAlign: 'center',
  },
  statusOkText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.forest,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.coral,
    textAlign: 'center',
  },
  list: {
    width: '100%',
    gap: 12,
    marginTop: 6,
  },
  queueCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: 18,
    gap: 10,
  },
  queueTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  queueTextCol: {
    flex: 1,
    gap: 4,
  },
  queueTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.ink,
  },
  queueGroup: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
  },
  queueAmount: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.forest,
    marginTop: 4,
  },
  queueStatusCol: {
    alignItems: 'center',
    gap: 4,
  },
  queueStatusText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.purple,
  },
  itemErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.peach,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  itemErrorText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.coral,
  },
  visibilityBanner: {
    backgroundColor: colors.lime,
    borderRadius: radii.card,
    padding: 16,
  },
  visibilityText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 18,
    color: colors.forest,
  },
  footerStack: {
    gap: 10,
  },
});
