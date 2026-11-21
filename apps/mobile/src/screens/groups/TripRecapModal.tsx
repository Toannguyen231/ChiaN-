import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { formatVnd } from '@chiane/shared';
import { ChiaNeButton } from '../../components';
import { colors, fonts, radii } from '../../theme/tokens';
import {
  buildRecapShareText,
  type TripRecapData,
} from '../../utils/recapCalculator';

export interface TripRecapModalProps {
  visible: boolean;
  recap: TripRecapData | null;
  onClose: () => void;
}

export function TripRecapModal({
  visible,
  recap,
  onClose,
}: TripRecapModalProps) {
  if (!recap) return null;

  const handleShare = async () => {
    await Share.share({
      message: buildRecapShareText(recap),
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.storyFrame}>
          {/* Smooth forest gradient background using react-native-svg */}
          <Svg
            width="100%"
            height="100%"
            style={StyleSheet.absoluteFill}
            preserveAspectRatio="none"
          >
            <Defs>
              <LinearGradient id="recapBg" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#1F5443" />
                <Stop offset="0.48" stopColor="#173E32" />
                <Stop offset="1" stopColor="#0E261E" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#recapBg)" />
          </Svg>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.storyScroll}
          >
            <View style={styles.topBar}>
              <View style={styles.brandPill}>
                <Text style={styles.brandPillText}>✨ CHIANÈ TRIP RECAP</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng Recap"
                onPress={onClose}
                hitSlop={10}
                style={styles.closeIconBtn}
              >
                <Text style={styles.closeIconText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.heroBlock}>
              <Text style={styles.groupTitle}>{recap.groupName}</Text>
              <Text style={styles.metaSubtitle}>
                {`${recap.tripDays} ngày · ${recap.memberCount} thành viên · ${recap.expenseCount} khoản chi`}
              </Text>
            </View>

            <View style={styles.totalCard}>
              <Text style={styles.totalEyebrow}>TỔNG THIỆT HẠI CHUYẾN ĐI</Text>
              <Text style={styles.totalAmount}>
                {formatVnd(recap.totalSpentVnd)}
              </Text>
              <View style={styles.totalSubRow}>
                <View style={styles.statPill}>
                  <Text style={styles.statPillText}>
                    {`Trung bình ${formatVnd(recap.averagePerMemberVnd)}/người`}
                  </Text>
                </View>
              </View>
              {recap.biggestExpense ? (
                <Text style={styles.biggestText}>
                  {`🔥 Chi đậm nhất: ${recap.biggestExpense.title} (${formatVnd(
                    recap.biggestExpense.amountVnd
                  )})`}
                </Text>
              ) : null}
            </View>

            {recap.categoryBreakdown.length > 0 ? (
              <View style={styles.glassCard}>
                <Text style={styles.glassTitle}>TỶ LỆ CHI TIÊU THEO DANH MỤC</Text>
                <View style={styles.barTrack}>
                  {recap.categoryBreakdown.map((item) => (
                    <View
                      key={item.category}
                      style={[
                        styles.barSegment,
                        {
                          flex: Math.max(item.percentage, 4),
                          backgroundColor: item.color,
                        },
                      ]}
                    />
                  ))}
                </View>
                <View style={styles.legendGrid}>
                  {recap.categoryBreakdown.map((item) => (
                    <View key={item.category} style={styles.legendItem}>
                      <View
                        style={[
                          styles.legendDot,
                          { backgroundColor: item.color },
                        ]}
                      />
                      <Text style={styles.legendLabel}>
                        {`${item.label} (${item.percentage}%)`}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.awardsSection}>
              <Text style={styles.glassTitle}>🏆 BẢNG VÀNG DANH HIỆU</Text>
              {recap.awards.length === 0 ? (
                <View style={styles.glassCard}>
                  <Text style={styles.emptyAwardsText}>
                    Hãy thêm khoản chi đầu tiên để ChiaNè trao danh hiệu vui cho từng người trong nhóm nhé!
                  </Text>
                </View>
              ) : (
                <View style={styles.awardsList}>
                  {recap.awards.map((award) => (
                    <View key={award.id} style={styles.awardCard}>
                      <View style={styles.awardEmojiBox}>
                        <Text style={styles.awardEmoji}>{award.emoji}</Text>
                      </View>
                      <View style={styles.awardTextCol}>
                        <Text style={styles.awardTitle}>{award.title}</Text>
                        <Text style={styles.awardWinner}>{award.winnerName}</Text>
                        <Text style={styles.awardStat}>{award.statLabel}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void handleShare()}
              style={({ pressed }) => [
                styles.shareBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.shareBtnText}>
                📤 Chia sẻ lên Zalo / Tin nhắn
              </Text>
            </Pressable>
            <ChiaNeButton
              label="Đóng"
              variant="quiet"
              onPress={onClose}
              style={styles.closeFooterBtn}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 26, 21, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 24,
  },
  storyFrame: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '94%',
    aspectRatio: 9 / 16,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(208, 244, 119, 0.28)',
    backgroundColor: colors.forest,
  },
  storyScroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 14,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandPill: {
    backgroundColor: 'rgba(208, 244, 119, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(208, 244, 119, 0.4)',
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  brandPillText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.lime,
    letterSpacing: 0.6,
  },
  closeIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIconText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.white,
  },
  heroBlock: {
    gap: 4,
    marginTop: 2,
  },
  groupTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 26,
    lineHeight: 34,
    color: colors.white,
  },
  metaSubtitle: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.onForestLabel,
  },
  totalCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    padding: 16,
    gap: 6,
  },
  totalEyebrow: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.onForestLabel,
    letterSpacing: 0.6,
  },
  totalAmount: {
    fontFamily: fonts.extraBold,
    fontSize: 32,
    lineHeight: 40,
    color: colors.lime,
  },
  totalSubRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  statPill: {
    backgroundColor: 'rgba(234, 229, 252, 0.16)',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statPillText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.lavender,
  },
  biggestText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.onForestMuted,
    marginTop: 4,
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    padding: 14,
    gap: 10,
  },
  glassTitle: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.onForestLabel,
    letterSpacing: 0.6,
  },
  barTrack: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    gap: 2,
  },
  barSegment: {
    height: '100%',
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.onForestMuted,
  },
  awardsSection: {
    gap: 8,
  },
  awardsList: {
    gap: 8,
  },
  awardCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: radii.row,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  awardEmojiBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(208, 244, 119, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  awardEmoji: {
    fontSize: 20,
  },
  awardTextCol: {
    flex: 1,
    gap: 1,
  },
  awardTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.onForestLabel,
  },
  awardWinner: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.white,
  },
  awardStat: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.lime,
  },
  emptyAwardsText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.onForestMuted,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    gap: 8,
    backgroundColor: 'rgba(14, 38, 30, 0.92)',
  },
  shareBtn: {
    height: 50,
    backgroundColor: colors.lime,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.forest,
  },
  closeFooterBtn: {
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  pressed: {
    opacity: 0.85,
  },
});
